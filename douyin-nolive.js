/*
 * 抖音屏蔽直播流 v2
 *
 * 原理: 拦截推荐 feed 接口响应, 剔除直播卡片。
 * 判定字段来源: 越狱插件 DYYY (https://github.com/VexCove/DYYY) 源码中
 *   AWEAwemeModel 的 isLive 属性, 对应 feed JSON 里每条 aweme 的 is_live 字段。
 *
 * QX 重写规则:
 *   ^https?:\/\/.*\.(snssdk\.com|tiktokv\.com|amemv\.com)\/aweme\/v\d+\/feed\/ url script-response-body <RAW_URL>
 * MITM 主机名: *.snssdk.com, *.tiktokv.com, *.amemv.com (已有 * 全匹配则不用加)
 */

const FEED_RE = /aweme\/v\d+\/feed\//;

if (!FEED_RE.test($request.url)) {
  $done({});
}

let obj;
try {
  obj = JSON.parse($response.body);
} catch (e) {
  $done({});
}

const KEY = Array.isArray(obj.aweme_list) ? 'aweme_list'
          : Array.isArray(obj.awemes) ? 'awemes' : null;
if (!KEY || obj[KEY].length === 0) {
  $done({});
}
const list = obj[KEY];

// 直播判定: is_live 为 true 即直播卡片 (DYYY: AWEAwemeModel.isLive)
function liveSignal(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.is_live === true) return 'is_live';
  if (item.isLive === true) return 'isLive';
  // 兜底: 其他历史字段
  if (item.room_id) return 'room_id';
  if (item.live_reason) return 'live_reason';
  return null;
}

const kept = [];
let removed = 0;
const sample = [];

for (const it of list) {
  const sig = liveSignal(it);
  if (sig) {
    removed++;
    if (sample.length < 3) {
      sample.push({
        sig: sig,
        aweme_type: it.aweme_type,
        desc: (it.desc || '').slice(0, 30),
        author: (it.author || {}).nickname
      });
    }
  } else {
    kept.push(it);
  }
}

obj[KEY] = kept;

console.log('[douyin-nolive] v2 total=' + list.length + ' removed=' + removed);
if (sample.length) {
  console.log('[douyin-nolive] removed_sample=' + JSON.stringify(sample));
}

$done({ body: JSON.stringify(obj) });
