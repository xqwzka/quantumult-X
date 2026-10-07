/*
 * 抖音屏蔽直播流 v1 — 启发式过滤 + 字段校准
 *
 * 原理: 拦截推荐 feed 接口响应, 把疑似直播卡片从 aweme_list 里剔除。
 * 状态: 直播标识字段尚未与真机返回对齐, 本版为保守启发式,
 *       并输出 [douyin-nolive] 日志供校准。先观察日志, 再收紧规则。
 *
 * QX 重写规则 (把 <RAW_URL> 换成你托管的 raw 链接):
 *   ^https?:\/\/.*\.(snssdk\.com|tiktokv\.com|amemv\.com)\/aweme\/v\d+\/feed\/ url script-response-body <RAW_URL>
 *
 * MITM 主机名需加: *.snssdk.com, *.tiktokv.com, *.amemv.com
 * (若 feed 接口被 pinning 导致刷不出内容, 关掉本规则即可恢复)
 */

const FEED_RE = /aweme\/v\d+\/feed\//;

if (!FEED_RE.test($request.url)) {
  $done({});
}

let obj;
try {
  obj = JSON.parse($response.body);
} catch (e) {
  console.log('[douyin-nolive] body 不是 JSON, 跳过: ' + $request.url);
  $done({});
}

const KEY = Array.isArray(obj.aweme_list) ? 'aweme_list'
          : Array.isArray(obj.awemes) ? 'awemes' : null;
if (!KEY) {
  $done({});
}
const list = obj[KEY];
if (list.length === 0) {
  $done({});
}

// ---- 直播信号判定 (v1 启发式, 待真机日志校准) ----
function liveSignal(item) {
  if (!item || typeof item !== 'object') return null;

  // 强信号: 明确的直播字段
  if (item.room_id) return 'room_id';
  if (item.live_reason) return 'live_reason';
  if (item.is_live === true) return 'is_live=true';
  if (item.live_info) return 'live_info';

  const author = item.author || {};
  if (author.room_id) return 'author.room_id';

  // 弱信号: 顶层 key 含 live (先只记录, v1 不据此过滤)
  for (const k of Object.keys(item)) {
    if (/live/i.test(k)) return 'weak:key:' + k;
  }
  return null;
}

const kept = [];
let removed = 0;
const removedSample = [];
const keptSample = [];

for (const it of list) {
  const sig = liveSignal(it);
  if (sig && !sig.startsWith('weak:')) {
    removed++;
    if (removedSample.length < 3) {
      removedSample.push({
        sig: sig,
        aweme_type: it.aweme_type,
        desc: (it.desc || '').slice(0, 30),
        author: (it.author || {}).nickname,
        keys: Object.keys(it).filter(k => /live|room/i.test(k))
      });
    }
  } else {
    kept.push(it);
    if (keptSample.length < 2) {
      keptSample.push({
        sig: sig, // 弱信号长什么样, 用于对比
        aweme_type: it.aweme_type,
        has_play_addr: !!(it.video && it.video.play_addr),
        keys: Object.keys(it).filter(k => /live|room/i.test(k))
      });
    }
  }
}

obj[KEY] = kept;

console.log('[douyin-nolive] url=' + $request.url.split('?')[0] +
  ' total=' + list.length + ' removed=' + removed);
console.log('[douyin-nolive] removed_sample=' + JSON.stringify(removedSample));
console.log('[douyin-nolive] kept_sample=' + JSON.stringify(keptSample));

$done({ body: JSON.stringify(obj) });
