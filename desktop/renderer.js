const api = window.releaseSutureDesktop;
const state = {
  casePath: '',
  outputPath: '',
  scanning: false,
  result: null,
  view: 'scan',
};

const elements = {
  casePath: document.querySelector('#case-path'),
  outputPath: document.querySelector('#output-path'),
  selectCase: document.querySelector('#select-case'),
  selectOutput: document.querySelector('#select-output'),
  runScan: document.querySelector('#run-scan'),
  runLabel: document.querySelector('#run-label'),
  status: document.querySelector('#status-message'),
  scanComplete: document.querySelector('#scan-complete'),
  navItems: [...document.querySelectorAll('[data-view]')],
  viewPanels: [...document.querySelectorAll('[data-view-panel]')],
  viewLinks: [...document.querySelectorAll('[data-open-view]')],
  resultPanel: document.querySelector('#result-panel'),
  reportLocation: document.querySelector('#report-location'),
  decisionCard: document.querySelector('#decision-card'),
  decisionValue: document.querySelector('#decision-value'),
  decisionDescription: document.querySelector('#decision-description'),
  critical: document.querySelector('#critical-count'),
  high: document.querySelector('#high-count'),
  medium: document.querySelector('#medium-count'),
  low: document.querySelector('#low-count'),
  findingSummary: document.querySelector('#finding-summary'),
  findings: document.querySelector('#findings-list'),
  planSummary: document.querySelector('#plan-summary'),
  releaseList: document.querySelector('#release-list'),
};

function setPath(element, value) {
  element.textContent = value || '尚未选择';
  element.title = value || '';
  element.classList.toggle('empty', !value);
}

function setStatus(message, type = '') {
  elements.status.textContent = message;
  elements.status.className = `status-message ${type}`.trim();
}

function refreshNavigation() {
  const reportReady = Boolean(state.result);
  for (const item of elements.navItems) {
    const view = item.dataset.view;
    item.disabled = view !== 'scan' && !reportReady;
    item.classList.toggle('active', view === state.view);
    if (view === state.view) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
}

function showView(view, behavior = 'smooth') {
  if (view !== 'scan' && !state.result) return;
  state.view = view;
  for (const panel of elements.viewPanels) {
    const active = panel.dataset.viewPanel === view;
    panel.classList.toggle('hidden', !active);
    panel.setAttribute('aria-hidden', String(!active));
  }
  refreshNavigation();
  window.scrollTo({ top: 0, behavior });
}

function invalidateReport() {
  state.result = null;
  elements.scanComplete.classList.add('hidden');
  elements.findings.replaceChildren();
  elements.releaseList.replaceChildren();
  elements.planSummary.textContent = '等待生成报告';
  showView('scan', 'auto');
}

function refreshActions() {
  elements.runScan.disabled = state.scanning || !state.casePath || !state.outputPath;
  elements.selectCase.disabled = state.scanning;
  elements.selectOutput.disabled = state.scanning;
  refreshNavigation();
}

function severityLabel(severity) {
  return String(severity || 'info').toUpperCase();
}

function addText(parent, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function setExpanded(toggle, details, expanded) {
  toggle.setAttribute('aria-expanded', String(expanded));
  details.hidden = !expanded;
  const chevron = toggle.querySelector('.disclosure-chevron');
  if (chevron) chevron.textContent = expanded ? '−' : '+';
}

function renderFinding(finding) {
  const card = document.createElement('article');
  card.className = 'finding';
  card.dataset.findingId = finding.id;

  const toggle = document.createElement('button');
  toggle.className = 'finding-toggle';
  toggle.type = 'button';

  const top = document.createElement('span');
  top.className = 'finding-top';
  addText(top, 'span', `severity ${finding.severity}`, severityLabel(finding.severity));
  addText(top, 'span', 'finding-title', finding.title);
  addText(top, 'span', 'rule-id', finding.ruleId);
  addText(top, 'span', 'disclosure-chevron', '−');
  toggle.appendChild(top);
  card.appendChild(toggle);

  const details = document.createElement('div');
  details.className = 'finding-details';
  const evidencePath = finding.evidence?.path || 'unknown';
  const line = finding.evidence?.line || 1;
  addText(details, 'p', 'finding-meta', `${evidencePath}:${line} · ${finding.verification || 'inferred'} · ${finding.scope || 'target'}`);
  addText(details, 'p', 'finding-explanation', finding.explanation || '');
  addText(details, 'pre', 'evidence', finding.evidence?.excerpt || '无摘录');

  const manual = document.createElement('p');
  manual.className = 'manual-note';
  addText(manual, 'strong', '', '人工参考（工具未执行）：');
  manual.appendChild(document.createTextNode(` ${finding.nextCommand || '无'}`));
  details.appendChild(manual);
  card.appendChild(details);

  toggle.addEventListener('click', () => {
    setExpanded(toggle, details, toggle.getAttribute('aria-expanded') !== 'true');
  });
  setExpanded(toggle, details, true);
  return card;
}

function focusFinding(findingId) {
  showView('report');
  const card = [...elements.findings.children]
    .find((candidate) => candidate.dataset.findingId === findingId);
  if (!card) return;
  const toggle = card.querySelector('.finding-toggle');
  const details = card.querySelector('.finding-details');
  if (toggle && details) setExpanded(toggle, details, true);
  card.classList.add('highlight');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => card.classList.remove('highlight'), 1800);
}

function phaseLabel(phase) {
  const labels = {
    identity: '材料确认',
    database: '数据库',
    backend: '后端产物',
    kubernetes: 'Kubernetes',
    frontend: '前端资源',
    handoff: '人工交付',
  };
  return labels[phase] || phase || '人工步骤';
}

function renderReleaseStep(step, findingsById) {
  const card = document.createElement('article');
  card.className = `release-step ${step.state || 'manual'}`;

  const toggle = document.createElement('button');
  toggle.className = 'release-step-toggle';
  toggle.type = 'button';
  addText(toggle, 'span', 'release-order', String(step.order).padStart(2, '0'));

  const heading = document.createElement('span');
  heading.className = 'release-step-heading';
  addText(heading, 'span', 'release-phase', phaseLabel(step.phase));
  addText(heading, 'strong', '', step.title);
  toggle.appendChild(heading);
  addText(toggle, 'span', `release-state ${step.state || 'manual'}`, step.state === 'blocked' ? '已阻断' : '待人工确认');
  addText(toggle, 'span', 'disclosure-chevron', '+');
  card.appendChild(toggle);

  const details = document.createElement('div');
  details.className = 'release-step-details';
  details.hidden = true;
  addText(details, 'span', 'gate-label', '人工门禁');
  addText(details, 'p', 'release-gate', step.gate || '需要人工确认。');

  const blockers = Array.isArray(step.blockers) ? step.blockers : [];
  const blockerArea = document.createElement('div');
  blockerArea.className = 'blocker-area';
  addText(blockerArea, 'span', 'gate-label', '关联阻断项');
  if (blockers.length === 0) {
    addText(blockerArea, 'p', 'no-blockers', '没有关联的 Critical/High 阻断项。');
  } else {
    const blockerList = document.createElement('div');
    blockerList.className = 'blocker-list';
    for (const blockerId of blockers) {
      const blocker = findingsById.get(blockerId);
      const button = document.createElement('button');
      button.className = 'blocker-link';
      button.type = 'button';
      button.textContent = blocker ? `${blocker.ruleId} · ${blocker.title}` : blockerId;
      button.addEventListener('click', () => focusFinding(blockerId));
      blockerList.appendChild(button);
    }
    blockerArea.appendChild(blockerList);
  }
  details.appendChild(blockerArea);
  card.appendChild(details);

  toggle.addEventListener('click', () => {
    setExpanded(toggle, details, toggle.getAttribute('aria-expanded') !== 'true');
  });
  setExpanded(toggle, details, false);
  return card;
}

function renderReleasePlan(report) {
  const steps = Array.isArray(report.releasePlan) ? report.releasePlan : [];
  const blockedSteps = steps.filter((step) => step.state === 'blocked').length;
  elements.planSummary.textContent = `${steps.length} 个步骤 · ${blockedSteps} 个步骤被风险阻断`;
  elements.releaseList.replaceChildren();

  if (steps.length === 0) {
    addText(elements.releaseList, 'div', 'empty-result', '报告中没有发布顺序。');
    return;
  }

  const findingsById = new Map(report.findings.map((finding) => [finding.id, finding]));
  for (const step of steps) elements.releaseList.appendChild(renderReleaseStep(step, findingsById));
}

function renderReport(result) {
  const { report, output } = result;
  const counts = report.summary.severityCounts;
  const decisionMap = {
    BLOCKED: ['阻断发布', '存在 Critical/High 目标制品风险', 'blocked'],
    REVIEW_REQUIRED: ['需要评审', '现状证据存在需要人工判断的风险', 'review'],
    READY_FOR_MANUAL_REVIEW: ['可进入人工评审', '离线规则未发现阻断项，不代表线上已验证', 'ready'],
  };
  const decision = decisionMap[report.summary.decision] || [report.summary.decision, '请查看完整报告', 'review'];

  elements.reportLocation.textContent = output.markdownPath;
  elements.reportLocation.title = output.markdownPath;
  elements.decisionCard.className = `decision-card ${decision[2]}`;
  elements.decisionValue.textContent = decision[0];
  elements.decisionDescription.textContent = decision[1];
  elements.critical.textContent = counts.critical;
  elements.high.textContent = counts.high;
  elements.medium.textContent = counts.medium;
  elements.low.textContent = counts.low;
  elements.findingSummary.textContent = `共 ${report.findings.length} 项 · 报告已载入当前界面并写入本地`;
  elements.findings.replaceChildren();

  if (report.findings.length === 0) {
    addText(elements.findings, 'div', 'empty-result', '没有命中当前离线规则，仍需进行人工发布评审。');
  } else {
    for (const finding of report.findings) elements.findings.appendChild(renderFinding(finding));
  }

  renderReleasePlan(report);
  elements.scanComplete.classList.remove('hidden');
}

for (const navItem of elements.navItems) {
  navItem.addEventListener('click', () => showView(navItem.dataset.view));
}

for (const viewLink of elements.viewLinks) {
  viewLink.addEventListener('click', () => showView(viewLink.dataset.openView));
}

elements.selectCase.addEventListener('click', async () => {
  try {
    const selection = await api.selectCase();
    if (!selection) return;
    invalidateReport();
    state.casePath = selection.casePath;
    state.outputPath = selection.suggestedOutputPath;
    setPath(elements.casePath, state.casePath);
    setPath(elements.outputPath, state.outputPath);
    setStatus('目录已就绪；扫描仅使用本地文件', 'success');
  } catch (error) {
    setStatus(error.message || '选择目录失败', 'error');
  } finally {
    refreshActions();
  }
});

elements.selectOutput.addEventListener('click', async () => {
  try {
    const selection = await api.selectOutput(state.outputPath);
    if (!selection) return;
    invalidateReport();
    state.outputPath = selection;
    setPath(elements.outputPath, state.outputPath);
    setStatus(state.casePath ? '目录已就绪；扫描仅使用本地文件' : '请继续选择证据目录', state.casePath ? 'success' : '');
  } catch (error) {
    setStatus(error.message || '选择目录失败', 'error');
  } finally {
    refreshActions();
  }
});

elements.runScan.addEventListener('click', async () => {
  state.scanning = true;
  elements.runScan.classList.add('loading');
  elements.runLabel.textContent = '正在离线鉴定…';
  setStatus('正在读取本地证据并计算 SHA-256；不会连接外部系统');
  refreshActions();

  try {
    const result = await api.runScan({ casePath: state.casePath, outputPath: state.outputPath });
    state.result = result;
    renderReport(result);
    setStatus(`鉴定完成：${result.report.findings.length} 项发现；报告已载入桌面界面`, 'success');
    showView('report');
  } catch (error) {
    setStatus(error.message || '扫描失败', 'error');
  } finally {
    state.scanning = false;
    elements.runScan.classList.remove('loading');
    elements.runLabel.textContent = '重新离线鉴定';
    refreshActions();
  }
});

setPath(elements.casePath, '');
setPath(elements.outputPath, '');
showView('scan', 'auto');
refreshActions();
