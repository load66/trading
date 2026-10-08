-- Standalone LEAPS worker leases and atomic paired publication.
-- The existing website's public SELECT-only data plane is unchanged.
CREATE TABLE IF NOT EXISTS public.leap_worker_leases (
  run_id bigint PRIMARY KEY REFERENCES public.leap_scan_runs(id) ON DELETE CASCADE,
  owner text NOT NULL,
  expires_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leap_worker_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leap_worker_leases FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.leap_worker_leases TO service_role;

CREATE OR REPLACE FUNCTION public.leaps_worker_claim(p_run_id bigint,p_owner text,p_lease_seconds integer DEFAULT 90)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_owner text;
BEGIN
  IF length(coalesce(p_owner,''))<8 OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN RETURN false; END IF;
  PERFORM 1 FROM public.leap_scan_runs
    WHERE id=p_run_id AND status IN ('queued','paused','running') FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.leap_worker_leases(run_id,owner,expires_at,heartbeat_at)
    VALUES (p_run_id,p_owner,now()+make_interval(secs=>p_lease_seconds),now())
    ON CONFLICT (run_id) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at,
       heartbeat_at=now() WHERE leap_worker_leases.expires_at<now();
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.leap_scan_runs SET status='running', updated_at=now() WHERE id=p_run_id;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.leaps_worker_renew(p_run_id bigint,p_owner text,p_lease_seconds integer DEFAULT 90)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_lease_seconds NOT BETWEEN 30 AND 300 THEN RETURN false; END IF;
  UPDATE public.leap_worker_leases
    SET expires_at=now()+make_interval(secs=>p_lease_seconds),heartbeat_at=now()
    WHERE run_id=p_run_id AND owner=p_owner AND expires_at>=now();
  RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.leaps_worker_release(p_run_id bigint,p_owner text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  DELETE FROM public.leap_worker_leases WHERE run_id=p_run_id AND owner=p_owner;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.leaps_worker_publish_pair(
  p_run_id bigint,p_owner text,p_research jsonb,p_market jsonb
) RETURNS TABLE(research_id bigint, market_id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_run public.leap_scan_runs%ROWTYPE;
  v_qualified integer;
  v_rejected integer;
  v_reviewed integer;
  v_universe integer;
  v_research_id bigint;
  v_market_id bigint;
  v_timestamp timestamptz;
  v_market_asof text;
BEGIN
  SELECT * INTO v_run FROM public.leap_scan_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.status<>'running' THEN RAISE EXCEPTION 'Worker run is not running'; END IF;
  PERFORM 1 FROM public.leap_worker_leases
    WHERE run_id=p_run_id AND owner=p_owner AND expires_at>=now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stale or unauthorized worker lease'; END IF;
  IF jsonb_typeof(p_research->'candidates')<>'array'
      OR jsonb_typeof(p_research->'rejected')<>'array'
      OR jsonb_typeof(p_market)<>'object'
      OR jsonb_typeof(p_research->'researchFunnel')<>'object' THEN
    RAISE EXCEPTION 'Invalid research / market schema';
  END IF;
  v_qualified:=jsonb_array_length(p_research->'candidates');
  v_rejected:=jsonb_array_length(p_research->'rejected');
  v_reviewed:=coalesce((p_research->'researchFunnel'->>'deepReviewCount')::integer,-1);
  v_universe:=coalesce((p_research->'researchFunnel'->>'universeScanned')::integer,0);
  IF v_qualified<=0 OR v_reviewed<>v_qualified+v_rejected
      OR v_reviewed<20 OR v_reviewed>v_universe
      OR v_reviewed>coalesce(v_run.universe_count,0)
      OR coalesce((p_research->'researchFunnel'->>'qualifiedCount')::integer,-1)<>v_qualified
      OR coalesce((p_research->'researchFunnel'->>'rejectedCount')::integer,-1)<>v_rejected
      THEN RAISE EXCEPTION 'Research funnel counts invalid'; END IF;
  v_timestamp:=(p_research->>'scanCompletedAt')::timestamptz;
  IF v_timestamp IS NULL OR v_timestamp<now()-interval '3 minutes'
      OR v_timestamp>now()+interval '20 seconds'
      OR v_timestamp<=v_run.started_at THEN
    RAISE EXCEPTION 'No fresh honest completion timestamp';
  END IF;
  IF (p_market->>'scanCompletedAt') IS DISTINCT FROM (p_research->>'scanCompletedAt') THEN
    RAISE EXCEPTION 'Paired completion timestamps differ';
  END IF;
  v_market_asof:=p_market->>'marketAsOf';
  IF coalesce(v_market_asof,'')='' THEN RAISE EXCEPTION 'Market as-of missing'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_research->'candidates') x
      WHERE x->>'qualified' IS DISTINCT FROM 'true'
        OR (x->>'fcfTTM')::numeric<=0
        OR (x->'fcf'->>0)::numeric<=0
        OR (x->'quarter'->'revg'->>0)::numeric<=0
        OR (x->'quarter'->'net'->>0)::numeric<=0) THEN
    RAISE EXCEPTION 'Failed hard gate detected in qualified results';
  END IF;
  INSERT INTO public.leap_research_snapshots (snapshot_date,candidate_count,payload,source_type)
    VALUES((v_timestamp AT TIME ZONE 'America/Chicago')::date,v_qualified,p_research,'worker_verified')
    RETURNING id INTO v_research_id;
  INSERT INTO public.leap_scans(market_as_of,prepared_for,market_state,triggered,message,payload,source_type)
    VALUES(v_market_asof,(v_timestamp AT TIME ZONE 'America/Chicago')::date,
           coalesce(nullif(p_market->>'marketState',''),'UNVERIFIED'),false,
           'Complete validated research pair',p_market,'worker_verified')
    RETURNING id INTO v_market_id;
  UPDATE public.leap_scan_runs
    SET status='completed',stage='published',research_snapshot_id=v_research_id,
        market_snapshot_id=v_market_id,completed_ticker_count=v_reviewed,updated_at=now(),
        last_error=NULL,metadata=metadata||jsonb_build_object('publicationAllowed',true,'publishedAt',now())
    WHERE id=p_run_id;
  research_id:=v_research_id;market_id:=v_market_id;RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.leaps_worker_claim(bigint,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.leaps_worker_renew(bigint,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.leaps_worker_release(bigint,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.leaps_worker_publish_pair(bigint,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leaps_worker_claim(bigint,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.leaps_worker_renew(bigint,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.leaps_worker_release(bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.leaps_worker_publish_pair(bigint,text,jsonb,jsonb) TO service_role;
