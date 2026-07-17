const api = window.releaseSutureDesktop;
const state = { casePath: '', outputPath: '', scanning: false };

const elements = {
  casePath: document.querySelector('#case-path'),
  outputPath: document.querySelector('#output-path'),
  selectCase: document.querySelector('#select-case'),
  selectOutput: document.querySelector('#select-output'),
  runScan: document.querySelector('#run-scan'),
  runLabel: document.querySelector('#run-label'),
  status: document.querySelector('#status-message'),
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

function refreshActions() {
  elements.runScan.disabled = state.scanning || !state.casePath || !state.outputPath;
  elements.selectCase.disabled = state.scanning;
  elements.selectOutput.disabled = state.scanning;
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

function renderFinding(finding) {
  const card = document.createElement('article');
  card.className = 'finding';

  const top = document.createElement('div');
  top.className = 'finding-top';
  addText(top, 'span', `severity ${finding.severity}`, severityLabel(finding.severity));
  addText(top, 'span', 'finding-title', finding.title);
  addText(top, 'span', 'rule-id', finding.ruleId);
  card.appendChild(top);

  const evidencePath = finding.evidence?.path || 'unknown';
  const line = finding.evidence?.line || 1;
  addText(card, 'p', 'finding-meta', `${evidencePath}:${line} · ${finding.verification || 'inferred'} · ${finding.scope || 'target'}`);
  addText(card, 'p', 'finding-explanation', finding.explanation || '');
  addText(card, 'pre', 'evidence', finding.evidence?.excerpt || '无摘录');

  const manual = document.createElement('p');
  manual.className = 'manual-note';
  addText(manual, 'strong', '', '人工参考（工具未执行）：');
  manual.appendChild(document.createTextNode(` ${finding.nextCommand || '无'}`));
  card.appendChild(manual);
  return card;
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

  elements.resultPanel.classList.remove('hidden');
  elements.reportLocation.textContent = output.markdownPath;
  elements.reportLocation.title = output.markdownPath;
  elements.decisionCard.className = `decision-card ${decision[2]}`;
  elements.decisionValue.textContent = decision[0];
  elements.decisionDescription.textContent = decision[1];
  elements.critical.textContent = counts.critical;
  elements.high.textContent = counts.high;
  elements.medium.textContent = counts.medium;
  elements.low.textContent = counts.low;
  elements.findingSummary.textContent = `共 ${report.findings.length} 项 · 报告已写入本地`;
  elements.findings.replaceChildren();

  if (report.findings.length === 0) {
    addText(elements.findings, 'div', 'empty-result', '没有命中当前离线规则，仍需进行人工发布评审。');
  } else {
    for (const finding of report.findings) elements.findings.appendChild(renderFinding(finding));
  }

  elements.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

elements.selectCase.addEventListener('click', async () => {
  try {
    const selection = await api.selectCase();
    if (!selection) return;
    state.casePath = selection.casePath;
    if (!state.outputPath) state.outputPath = selection.suggestedOutputPath;
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
    renderReport(result);
    setStatus(`鉴定完成：${result.report.findings.length} 项发现，未连接任何外部系统`, 'success');
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
refreshActions();
