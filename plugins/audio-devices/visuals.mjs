const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[c]);

const states = {
  disconnected: { bg: '#171c24', color: '#8993a3', label: '未连接', detail: '设备不可用' },
  default: { bg: '#0f3026', color: '#65e6a6', label: '系统默认输出', detail: '当前正在使用' },
  connected: { bg: '#142b42', color: '#81c3ff', label: '已连接', detail: '按下设为默认' },
  loading: { bg: '#202733', color: '#c5ceda', label: '读取中', detail: '正在读取系统' },
  error: { bg: '#38251c', color: '#ffc184', label: '读取失败', detail: '稍后自动重试' },
  unconfigured: { bg: '#38251c', color: '#ffc184', label: '需要配置', detail: '设置设备 ID' },
};

export function keySvg(label, state, switching = false) {
  const s = states[state] ?? states.error;
  const status = switching ? '切换中' : s.label;
  const title = Array.from(String(label)).slice(0, 18).join('');
  const titleSize = title.length > 12 ? 13 : title.length > 8 ? 17 : 20;
  const badge = state === 'default'
    ? '<circle cx="109" cy="35" r="12" fill="#65e6a6"/><path d="m103 35 4 4 8-9" fill="none" stroke="#0f3026" stroke-width="3"/>'
    : state === 'disconnected' ? '<path d="m52 27 40 38" stroke="#8993a3" stroke-width="4"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" rx="12" fill="${s.bg}"/>
<rect x="3" y="3" width="138" height="138" rx="10" fill="none" stroke="${s.color}" stroke-width="${state === 'default' ? 4 : 2}"/>
<g fill="none" stroke="${s.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
<path d="M53 34H64L79 23V65L64 54H53Z"/><path d="M87 32Q102 44 87 56"/>
</g>${badge}
<g fill="${s.color}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif">
<text x="72" y="86" font-size="${titleSize}" font-weight="600">${escapeXml(title)}</text>
<text x="72" y="111" font-size="18" font-weight="600">${escapeXml(status)}</text>
<text x="72" y="130" font-size="12">${escapeXml(s.detail)}</text>
</g></svg>`;
}

export const imageUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
