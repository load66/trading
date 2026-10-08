#!/usr/bin/env node
// Refresh only public price observations. Research, rank, support plans and option data stay immutable.
const fs = require("node:fs");
const path = require("node:path");

const input = process.argv[2];
const marketPath = process.argv[3] || path.resolve(__dirname, "../dist/data/market-latest.json");
if (!input) throw new Error("Usage: node scripts/refresh_market_quotes.js quote-batch.json [market-latest.json]");
const batch = JSON.parse(fs.readFileSync(input, "utf8"));
const market = JSON.parse(fs.readFileSync(marketPath, "utf8"));
const observed = new Date(batch.observedAt);
if (!Number.isFinite(observed.getTime()) || observed > new Date() || Date.now() - observed.getTime() > 15 * 60_000)
  throw new Error("Quote retrieval time is missing or older than 15 minutes");
const qualified = market.candidatePlans.map(p => p.ticker);
for (const symbol of [...qualified, "SPY", "QQQ"]) {
  const quote = batch.quotes[symbol];
  if (!quote || quote.success !== true || quote.symbol !== symbol || !Number.isFinite(quote.current) || quote.current <= 0 ||
      !Number.isFinite(quote.change) || !Number.isFinite(quote.changePercent))
    throw new Error("Missing or invalid public quote for " + symbol);
}
const stamp = observed.toISOString();
const chicago = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).format(observed);
const date = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).format(observed);
const nyParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone:"America/New_York",
  weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(observed)
  .filter(x => ["weekday","hour","minute"].includes(x.type)).map(x => [x.type,x.value]));
const nyMinute = Number(nyParts.hour)*60+Number(nyParts.minute);
const regularHours = !["Sat","Sun"].includes(nyParts.weekday) && nyMinute >= 570 && nyMinute < 960;
const regularSession = batch.marketOpen === true;
const sessionStatus = regularSession ? "REGULAR SESSION" :
  batch.marketOpen === false || !regularHours ? "MARKET CLOSED" : "SESSION UNVERIFIED";
const source = "AlphaStocks public quote retrieved " + chicago + " America/Chicago; provider supplied no exchange trade timestamp";
function zone(value) {
  const nums = (String(value || "").replace(/,/g,"").match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) throw new Error("Unparseable support zone " + value);
  return {low:Math.min(...nums), high:Math.max(...nums)};
}
function timing(p) {
  const levels = [
    {key:"entry1", label:"1ST MAJOR SUPPORT", action:"BUY ZONE — ENTRY 1", size:"30%"},
    {key:"add2", label:"2ND MAJOR SUPPORT", action:"ADD ZONE — ADD 2", size:"30%"},
    {key:"finalAdd", label:"FINAL MAJOR SUPPORT", action:"ADD ZONE — FINAL ADD", size:"40%"}
  ].map(x => ({...x, zone:zone(p[x.key])}));
  const inZone = levels.find(x => p.price >= x.zone.low && p.price <= x.zone.high);
  if (inZone) return {level:inZone, state:"AT " + inZone.label, distance:0, action:
    /^INTACT\b/.test(p.thesisStatus || "") && !/UNRESOLVED/.test(p.thesisStatus || "")
      ? inZone.action : "DO NOT ADD YET"};
  const next = levels.filter(x => p.price > x.zone.high).sort((a,b) => b.zone.high - a.zone.high)[0];
  if (!next) return {level:null,state:"BELOW PLANNED SUPPORTS",distance:null,action:"WAIT"};
  const distance = (p.price-next.zone.high)/next.zone.high*100;
  return {level:next,state:distance <= 1 ? "NEAR SUPPORT" : "ABOVE SUPPORT",distance,
    action:distance <= 1 ? "NEAR SUPPORT — WATCH" : "WAIT"};
}
for (const p of market.candidatePlans) {
  const q = batch.quotes[p.ticker];
  p.price = q.current;
  p.previousClose = Number((q.current-q.change).toFixed(4));
  p.todayPct = q.changePercent;
  p.intradayHigh = q.high;
  p.intradayLow = q.low;
  p.quoteObservedAt = stamp;
  p.exchangeQuoteTimestamp = null;
  p.source = source;
  const s = timing(p);
  p.supportStatus = s.state;
  p.supportLevel = s.level?.label || null;
  p.supportZone = s.level ? p[s.level.key] : null;
  p.supportDistancePct = s.distance;
  p.distanceToSupport = s.distance;
  p.supportReason = s.level ? p[s.level.key+"Reason"] : null;
  p.action = s.action;
  p.entryStatus = s.action;
  p.staging = s.level && s.state.startsWith("AT ") && s.action !== "DO NOT ADD YET"
    ? s.level.size + " stock support stage; check current material news, thesis and LEAPS contract before trading"
    : "30% / 30% / 40% at published major support zones; contract remains unverified";
}
for (const symbol of ["SPY","QQQ"]) {
  const q = batch.quotes[symbol], row = market.market[symbol.toLowerCase()];
  row.close = q.current;
  row.previousClose = Number((q.current-q.change).toFixed(4));
  row.dayChangePct = q.changePercent;
  row.intradayHigh = q.high;
  row.intradayLow = q.low;
  row.observedAt = stamp;
  row.exchangeQuoteTimestamp = null;
  row.source = source;
  if (row.averages) row.distanceFromMA = Object.fromEntries(
    Object.entries(row.averages).map(([key,value]) => [key,(q.current-value)/value]));
}
market.marketAsOf = source + ". VIX reference observed " + market.market.vix.observedAt +
  " and is not synchronized; technical bars " + market.technicalBarCutoff + ".";
market.quoteObservation = {observedAt:stamp,displayedAtChicago:chicago+" America/Chicago",
  source:"AlphaStocks",exchangeTimestampsAvailable:false,tradeTimestampUnknown:true};
market.quoteCutoffs = {...market.quoteCutoffs,equities:stamp,vix:market.market.vix.observedAt};
market.scanCompletedAt = stamp;
market.preparedFor = date;
market.marketSession = {...market.marketSession,status:sessionStatus,sessionDate:date,
  verifiedAt:stamp,source:typeof batch.marketOpen === "boolean"
    ? "Alpaca market clock (session status only; no private quote redistributed)"
    : "U.S. Eastern market hours; holiday/early-close status unverified"};
market.marketState = regularSession ? "NORMAL DAY" : sessionStatus;
market.triggered = false;
market.triggerReasons = [];
market.stockEntryTriggers = [];
const inZones = market.candidatePlans.filter(p => p.supportStatus.startsWith("AT ")).map(p => p.ticker);
market.message = "Public price-only refresh" + (regularSession ? " during the regular session. " :
  sessionStatus === "MARKET CLOSED" ? " outside regular market hours. " : " with session status unverified. ") +
  (inZones.length ? inZones.join(", ")+" at published major support. " : "No qualified stock inside a published major support zone. ") +
  "Published research, VIX, technical levels and option references were not refreshed. Verify current material news, thesis and LEAPS contract before trading.";
market.publicationMode = "public_price_only_refresh";
market.dashboardRefreshed = true;
market.dataLimitations = [...new Set([...(market.dataLimitations || []).filter(x =>
  !String(x).startsWith("This after-hours price retrieval") &&
  !String(x).startsWith("The scheduled research/market jobs did not publish")),
  "Public price retrieval has no exchange trade timestamp; it may represent an earlier trade or close. VIX and technical bars remain older references."])];
fs.writeFileSync(marketPath,JSON.stringify(market,null,2)+"\n");
console.log(JSON.stringify({observedAt:stamp,qualified:qualified.length,atSupport:market.candidatePlans.filter(p => p.supportStatus.startsWith("AT ")).map(p => p.ticker),marketAsOf:market.marketAsOf},null,2));
