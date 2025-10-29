let currentData = null;
let benchmarkData = null;

// File input handlers
document.getElementById('jsonFile').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            currentData = data;
            renderDashboard(data);
            hideError();
        } catch (error) {
            showError('Failed to parse JSON file: ' + error.message);
        }
    };
    reader.readAsText(file);
});

document.getElementById('benchmarkFile').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const csvText = e.target.result;
            benchmarkData = parseBenchmarkCsv(csvText);
            console.log('Benchmark loaded:', benchmarkData.length, 'rows');
            
            // Re-render if we have current data
            if (currentData) {
                renderDashboard(currentData);
            }
            hideError();
        } catch (error) {
            showError('Failed to parse benchmark CSV: ' + error.message);
        }
    };
    reader.readAsText(file);
});

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

function showWarning(message) {
    const warningEl = document.getElementById('warningMessage');
    warningEl.innerHTML = message;
    warningEl.style.display = 'block';
}

function hideWarning() {
    document.getElementById('warningMessage').style.display = 'none';
}

function renderDashboard(data) {
    checkForNewTools(data);
    renderBenchmarkSummary(data);
    renderMetrics(data);
    renderTools(data);
    
    document.getElementById('metricsSection').style.display = 'block';
    document.getElementById('toolsSection').style.display = 'block';
}

function checkForNewTools(data) {
    if (!benchmarkData) {
        hideWarning();
        return;
    }
    
    const currentToolIds = [...new Set(data.results.map(r => r.tool))];
    const benchmarkToolIds = new Set(benchmarkData.map(b => b.tool_id));
    
    const newTools = currentToolIds.filter(id => !benchmarkToolIds.has(id));
    
    if (newTools.length > 0) {
        const toolList = newTools.map(id => `<code>${id}</code>`).join(', ');
        showWarning(`⚠️ <strong>New tools not in benchmark:</strong> ${toolList}`);
    } else {
        hideWarning();
    }
}

function renderBenchmarkSummary(data) {
    const summaryEl = document.getElementById('benchmarkSummary');
    
    if (!benchmarkData) {
        summaryEl.style.display = 'none';
        return;
    }
    
    const currentToolIds = [...new Set(data.results.map(r => r.tool))];
    const benchmarkToolIds = new Set(benchmarkData.map(b => b.tool_id));
    const commonToolIds = currentToolIds.filter(id => benchmarkToolIds.has(id));
    
    const totalBenchmarkTools = new Set(benchmarkData.map(b => b.tool_id)).size;
    
    summaryEl.innerHTML = `
        <strong>Benchmark Comparison:</strong> Comparing your metrics agains the same <strong>${commonToolIds.length}</strong> tools 
        (There are ${totalBenchmarkTools} possible total in benchmark)
    `;
    summaryEl.style.display = 'block';
}

// Calculate and render metrics
function renderMetrics(data) {
    const { config, results } = data;
    
    // Config info
    document.getElementById('llm').textContent = `${config.llmProvider} / ${config.backendModel}`;
    document.getElementById('validationLlm').textContent = `${config.validationLlmProvider} / ${config.validationLlmModel}`;
    document.getElementById('attemptsPerMode').textContent = config.attemptsPerMode;
    
    // Calculate metrics
    const oneShotAttempts = results.filter(r => !r.selfHealingEnabled);
    const selfHealingAttempts = results.filter(r => r.selfHealingEnabled);
    
    // Group by tool to calculate per-tool success
    const toolsById = groupByTool(results);
    const totalTools = Object.keys(toolsById).length;
    
    // One-shot success: tools that succeeded in one-shot mode
    const oneShotSuccessfulTools = Object.values(toolsById).filter(attempts => {
        return attempts.some(a => !a.selfHealingEnabled && a.overallValidationPassed === true);
    }).length;
    const oneShotRate = totalTools > 0 ? (oneShotSuccessfulTools / totalTools * 100) : null;
    
    // Self-healing success: tools that succeeded in either one-shot OR self-healing
    const selfHealingSuccessfulTools = Object.values(toolsById).filter(attempts => {
        const oneShotSuccess = attempts.some(a => !a.selfHealingEnabled && a.overallValidationPassed === true);
        const selfHealingSuccess = attempts.some(a => a.selfHealingEnabled && a.overallValidationPassed === true);
        return oneShotSuccess || selfHealingSuccess;
    }).length;
    const selfHealingRate = totalTools > 0 ? (selfHealingSuccessfulTools / totalTools * 100) : null;
    
    // Build times (convert to seconds)
    const buildTimes = results.filter(r => r.buildTime !== null).map(r => r.buildTime);
    const avgBuild = buildTimes.length > 0 ? (buildTimes.reduce((a, b) => a + b, 0) / buildTimes.length) : null;
    
    // Execution times - one-shot
    const oneShotExecTimes = oneShotAttempts.filter(r => r.executionTime !== null).map(r => r.executionTime);
    const avgOneShotExec = oneShotExecTimes.length > 0 ? (oneShotExecTimes.reduce((a, b) => a + b, 0) / oneShotExecTimes.length) : null;
    
    // Execution times - self-healing
    const selfHealingExecTimes = selfHealingAttempts.filter(r => r.executionTime !== null).map(r => r.executionTime);
    const avgSelfHealingExec = selfHealingExecTimes.length > 0 ? (selfHealingExecTimes.reduce((a, b) => a + b, 0) / selfHealingExecTimes.length) : null;
    
    // Calculate benchmark metrics if available
    let benchmarkMetrics = null;
    if (benchmarkData) {
        const currentToolIds = [...new Set(results.map(r => r.tool))];
        const filteredBenchmark = benchmarkData.filter(b => currentToolIds.includes(b.tool_id));
        benchmarkMetrics = calculateBenchmarkMetrics(filteredBenchmark);
    }
    
    // Display with deltas
    displayMetricWithDelta('oneShotSuccessRate', oneShotRate, benchmarkMetrics?.oneShotRate, '%', 
        `${oneShotSuccessfulTools}/${totalTools}`, true);
    displayMetricWithDelta('selfHealingSuccessRate', selfHealingRate, benchmarkMetrics?.selfHealingRate, '%',
        `${selfHealingSuccessfulTools}/${totalTools}`, true);
    displayMetricWithDelta('avgBuildTime', avgBuild, benchmarkMetrics?.avgBuild, 's', null, false, true);
    displayMetricWithDelta('avgExecOneShot', avgOneShotExec, benchmarkMetrics?.avgOneShotExec, 's', null, false, true);
    displayMetricWithDelta('avgExecSelfHealing', avgSelfHealingExec, benchmarkMetrics?.avgSelfHealingExec, 's', null, false, true);
}

function calculateBenchmarkMetrics(filteredBenchmark) {
    const toolIds = [...new Set(filteredBenchmark.map(b => b.tool_id))];
    
    // One-shot success rate
    const oneShotSuccessCount = toolIds.filter(toolId => {
        const oneShotRow = filteredBenchmark.find(b => b.tool_id === toolId && b.mode === 'one-shot');
        return oneShotRow && oneShotRow.success === true;
    }).length;
    const oneShotRate = toolIds.length > 0 ? (oneShotSuccessCount / toolIds.length * 100) : null;
    
    // Self-healing success rate (succeeded in any mode)
    const selfHealingSuccessCount = toolIds.filter(toolId => {
        const toolRows = filteredBenchmark.filter(b => b.tool_id === toolId);
        return toolRows.some(row => row.success === true);
    }).length;
    const selfHealingRate = toolIds.length > 0 ? (selfHealingSuccessCount / toolIds.length * 100) : null;
    
    // Average build time
    const buildTimes = filteredBenchmark.filter(b => b.avg_build_time_ms !== null).map(b => b.avg_build_time_ms);
    const avgBuild = buildTimes.length > 0 ? (buildTimes.reduce((a, b) => a + b, 0) / buildTimes.length) : null;
    
    // Average execution times
    const oneShotExecTimes = filteredBenchmark
        .filter(b => b.mode === 'one-shot' && b.avg_exec_time_ms !== null)
        .map(b => b.avg_exec_time_ms);
    const avgOneShotExec = oneShotExecTimes.length > 0 ? 
        (oneShotExecTimes.reduce((a, b) => a + b, 0) / oneShotExecTimes.length) : null;
    
    const selfHealingExecTimes = filteredBenchmark
        .filter(b => b.mode === 'self-healing' && b.avg_exec_time_ms !== null)
        .map(b => b.avg_exec_time_ms);
    const avgSelfHealingExec = selfHealingExecTimes.length > 0 ?
        (selfHealingExecTimes.reduce((a, b) => a + b, 0) / selfHealingExecTimes.length) : null;
    
    return {
        oneShotRate,
        selfHealingRate,
        avgBuild,
        avgOneShotExec,
        avgSelfHealingExec
    };
}

function displayMetricWithDelta(elementId, current, benchmark, unit, suffix, higherIsBetter, lowerIsBetter = false) {
    const element = document.getElementById(elementId);
    
    if (current === null) {
        element.innerHTML = 'N/A';
        return;
    }
    
    const divisor = unit === 's' ? 1000 : 1;
    const displayValue = (current / divisor).toFixed(unit === '%' ? 1 : 2);
    const suffixText = suffix ? ` (${suffix})` : '';
    
    if (benchmark === null || benchmark === undefined) {
        element.innerHTML = `${displayValue}${unit}${suffixText}`;
        return;
    }
    
    const benchmarkDisplay = (benchmark / divisor).toFixed(unit === '%' ? 1 : 2);
    const absoluteDiff = (current - benchmark) / divisor;
    const percentChange = ((current - benchmark) / benchmark) * 100;
    
    const diffSign = absoluteDiff > 0 ? '+' : '';
    const deltaClass = getDeltaClass(absoluteDiff, higherIsBetter, lowerIsBetter);
    
    const pointLabel = unit === '%' ? 'points' : unit;
    const deltaText = unit === '%' 
        ? `${diffSign}${absoluteDiff.toFixed(1)} ${pointLabel} vs ${benchmarkDisplay}${unit} (${diffSign}${percentChange.toFixed(1)}% change)`
        : `${diffSign}${absoluteDiff.toFixed(2)}${unit} vs ${benchmarkDisplay}${unit} (${diffSign}${percentChange.toFixed(1)}%)`;
    
    element.innerHTML = `
        ${displayValue}${unit}${suffixText}
        <span class="metric-delta ${deltaClass}">${deltaText}</span>
    `;
}

function getDeltaClass(delta, higherIsBetter, lowerIsBetter) {
    if (Math.abs(delta) < 0.1) return 'delta-neutral';
    
    if (higherIsBetter) {
        return delta > 0 ? 'delta-positive' : 'delta-negative';
    }
    if (lowerIsBetter) {
        return delta < 0 ? 'delta-positive' : 'delta-negative';
    }
    return 'delta-neutral';
}

// Group and render tools
function renderTools(data) {
    const { results } = data;
    const toolsById = groupByTool(results);
    
    const toolsList = document.getElementById('toolsList');
    toolsList.innerHTML = '';
    
    Object.entries(toolsById).forEach(([toolId, attempts]) => {
        const toolItem = createToolItem(toolId, attempts);
        toolsList.appendChild(toolItem);
    });
}

function groupByTool(results) {
    const grouped = {};
    results.forEach(result => {
        const toolId = result.tool;
        if (!grouped[toolId]) {
            grouped[toolId] = [];
        }
        grouped[toolId].push(result);
    });
    return grouped;
}

function getToolStatusChange(toolId, oneShotAttempts, selfHealingAttempts) {
    if (!benchmarkData) return null;
    
    const benchmarkRows = benchmarkData.filter(b => b.tool_id === toolId);
    if (benchmarkRows.length === 0) return null;
    
    const changes = [];
    
    // Check one-shot mode
    if (oneShotAttempts.length > 0) {
        const benchmarkOneShot = benchmarkRows.find(b => b.mode === 'one-shot');
        if (benchmarkOneShot) {
            const currentSuccess = oneShotAttempts.some(a => a.overallValidationPassed === true);
            const benchmarkSuccess = benchmarkOneShot.success === true;
            
            if (benchmarkSuccess && !currentSuccess) {
                const currentFailure = getFailureStage(getFurthestAttempt(oneShotAttempts));
                changes.push({
                    type: 'regression',
                    mode: 'one-shot',
                    detail: `was ✓, now ${currentFailure.label}`
                });
            } else if (!benchmarkSuccess && currentSuccess) {
                changes.push({
                    type: 'improvement',
                    mode: 'one-shot',
                    detail: 'was ✗, now ✓'
                });
            }
        }
    }
    
    // Check self-healing mode
    if (selfHealingAttempts.length > 0) {
        const benchmarkSelfHealing = benchmarkRows.find(b => b.mode === 'self-healing');
        if (benchmarkSelfHealing) {
            const currentSuccess = selfHealingAttempts.some(a => a.overallValidationPassed === true);
            const benchmarkSuccess = benchmarkSelfHealing.success === true;
            
            if (benchmarkSuccess && !currentSuccess) {
                const currentFailure = getFailureStage(getFurthestAttempt(selfHealingAttempts));
                changes.push({
                    type: 'regression',
                    mode: 'self-healing',
                    detail: `was ✓, now ${currentFailure.label}`
                });
            } else if (!benchmarkSuccess && currentSuccess) {
                changes.push({
                    type: 'improvement',
                    mode: 'self-healing',
                    detail: 'was ✗, now ✓'
                });
            }
        }
    }
    
    if (changes.length === 0) return null;
    
    // Return the most severe change with all details
    const hasRegression = changes.some(c => c.type === 'regression');
    return {
        type: hasRegression ? 'regression' : 'improvement',
        changes: changes
    };
}

function createToolItem(toolId, attempts) {
    const container = document.createElement('div');
    container.className = 'tool-item';
    
    const oneShotAttempts = attempts.filter(a => !a.selfHealingEnabled);
    const selfHealingAttempts = attempts.filter(a => a.selfHealingEnabled);
    
    const toolName = attempts[0].toolName;
    
    // Check for status changes vs benchmark
    const statusChangeInfo = getToolStatusChange(toolId, oneShotAttempts, selfHealingAttempts);
    
    // Create header
    const header = document.createElement('div');
    header.className = 'tool-header';
    
    const statusChangeBadge = statusChangeInfo ? createStatusChangeBadge(statusChangeInfo) : '';
    
    header.innerHTML = `
        <div class="tool-info">
            <div class="tool-name-row">
                <div class="tool-name">${toolName}</div>
                ${statusChangeBadge}
            </div>
            <div class="tool-id">${toolId}</div>
        </div>
        <div class="status-indicators">
            ${oneShotAttempts.length > 0 ? createModeStatusHTML('One-Shot', oneShotAttempts) : ''}
            ${createModeStatusHTML('Self-Healing', selfHealingAttempts)}
            <span class="expand-icon">▶</span>
        </div>
    `;
    
    // Create content (hidden by default)
    const content = document.createElement('div');
    content.className = 'tool-content';
    
    // Always show tabs for consistency
    const tabs = document.createElement('div');
    tabs.className = 'mode-tabs';
    tabs.innerHTML = `
        <div class="tab active" data-mode="oneshot">One-Shot (${oneShotAttempts.length})</div>
        <div class="tab" data-mode="selfhealing">Self-Healing (${selfHealingAttempts.length})</div>
    `;
    content.appendChild(tabs);
    
    const oneShotContainer = document.createElement('div');
    oneShotContainer.className = 'attempts-container';
    oneShotContainer.dataset.mode = 'oneshot';
    if (oneShotAttempts.length > 0) {
        oneShotAttempts.forEach((attempt, index) => {
            oneShotContainer.appendChild(createAttemptCard(attempt, 'One-Shot', index + 1));
        });
    } else {
        oneShotContainer.innerHTML = '<div class="no-attempts-message">No one-shot attempts</div>';
    }
    content.appendChild(oneShotContainer);
    
    const selfHealingContainer = document.createElement('div');
    selfHealingContainer.className = 'attempts-container';
    selfHealingContainer.dataset.mode = 'selfhealing';
    selfHealingContainer.style.display = 'none';
    if (selfHealingAttempts.length > 0) {
        selfHealingAttempts.forEach((attempt, index) => {
            selfHealingContainer.appendChild(createAttemptCard(attempt, 'Self-Healing', index + 1));
        });
    } else {
        selfHealingContainer.innerHTML = '<div class="no-attempts-message">No self-healing attempts</div>';
    }
    content.appendChild(selfHealingContainer);
    
    // Tab switching
    tabs.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const mode = tab.dataset.mode;
            content.querySelectorAll('.attempts-container').forEach(c => {
                c.style.display = c.dataset.mode === mode ? 'block' : 'none';
            });
        });
    });
    
    // Toggle expand/collapse
    header.addEventListener('click', () => {
        const isExpanded = header.classList.contains('expanded');
        header.classList.toggle('expanded');
        content.classList.toggle('expanded');
    });
    
    container.appendChild(header);
    container.appendChild(content);
    
    return container;
}

function createStatusChangeBadge(statusChangeInfo) {
    const { type, changes } = statusChangeInfo;
    
    // Create detailed text showing all changes
    const details = changes.map(change => {
        const modeLabel = change.mode === 'one-shot' ? 'One-Shot' : 'Self-Healing';
        return `${modeLabel}: ${change.detail}`;
    }).join('; ');
    
    if (type === 'regression') {
        return `<span class="status-change-badge status-change-regression" title="${escapeHtml(details)}">⚠ Regression (${details})</span>`;
    } else if (type === 'improvement') {
        return `<span class="status-change-badge status-change-improvement" title="${escapeHtml(details)}">✓ Improvement (${details})</span>`;
    }
    return '';
}

function createModeStatusHTML(modeName, attempts) {
    // If no attempts, show skipped
    if (attempts.length === 0) {
        return `
            <div class="mode-status">
                <div class="mode-label">${modeName}</div>
                <div class="status-badges">
                    <span class="badge badge-neutral">Skipped</span>
                </div>
            </div>
        `;
    }
    
    // Find the furthest attempt (one that progressed most)
    const furthestAttempt = getFurthestAttempt(attempts);
    const succeeded = attempts.some(a => a.overallValidationPassed === true);
    
    if (succeeded) {
        return `
            <div class="mode-status">
                <div class="mode-label">${modeName}</div>
                <div class="status-badges">
                    <span class="badge badge-success">✓ Succeeded</span>
                </div>
            </div>
        `;
    }
    
    // Failed - show where it failed
    const failureStage = getFailureStage(furthestAttempt);
    return `
        <div class="mode-status">
            <div class="mode-label">${modeName}</div>
            <div class="status-badges">
                <span class="badge ${failureStage.badgeClass}">${failureStage.label}</span>
            </div>
        </div>
    `;
}

function getFurthestAttempt(attempts) {
    // Order by progression: build -> execution -> validation
    const statusOrder = {
        'build_failed': 1,
        'execution_failed': 2,
        'validation_failed_llm_failed': 3,
        'validation_failed_llm_partial': 3,
        'validation_skipped_llm_failed': 3,
        'validation_skipped_llm_partial': 3,
        'validation_passed': 4,
        'validation_failed_llm_passed': 4,
        'validation_skipped_llm_passed': 4
    };
    
    return attempts.reduce((furthest, current) => {
        const currentOrder = statusOrder[current.status] || 0;
        const furthestOrder = statusOrder[furthest.status] || 0;
        return currentOrder > furthestOrder ? current : furthest;
    });
}

function getFailureStage(attempt) {
    if (!attempt.buildSuccess) {
        return { label: '✗ Build Failed', badgeClass: 'badge-failure' };
    }
    if (!attempt.executionSuccess) {
        return { label: '✗ Execution Failed', badgeClass: 'badge-failure' };
    }
    if (attempt.status.includes('partial')) {
        return { label: '~ Validation Partial', badgeClass: 'badge-partial' };
    }
    return { label: '✗ Validation Failed', badgeClass: 'badge-failure' };
}

function createStatusBadge(label, success) {
    if (success === null) {
        return `<span class="badge badge-neutral">${label}: -</span>`;
    }
    const badgeClass = success ? 'badge-success' : 'badge-failure';
    const icon = success ? '✓' : '✗';
    return `<span class="badge ${badgeClass}">${label}: ${icon}</span>`;
}

function createLLMBadge(judgment) {
    if (!judgment) {
        return `<span class="badge badge-neutral">LLM: -</span>`;
    }
    if (judgment === 'passes') {
        return `<span class="badge badge-success">LLM: ✓</span>`;
    }
    if (judgment === 'partial') {
        return `<span class="badge badge-partial">LLM: ~</span>`;
    }
    return `<span class="badge badge-failure">LLM: ✗</span>`;
}

function createAttemptCard(attempt, mode, attemptNumber) {
    const card = document.createElement('div');
    card.className = 'attempt-card';
    
    const attemptId = `attempt-${Math.random().toString(36).substr(2, 9)}`;
    
    const attemptHeader = document.createElement('div');
    attemptHeader.className = 'attempt-card-header';
    attemptHeader.innerHTML = `
        <div class="attempt-title">
            <span class="attempt-mode">${mode} - Attempt ${attemptNumber}</span>
            <div class="attempt-times">
                <div class="time-item">
                    <span class="time-label">Build:</span>
                    <span>${attempt.buildTime !== null ? (attempt.buildTime / 1000).toFixed(2) + 's' : 'N/A'}</span>
                </div>
                <div class="time-item">
                    <span class="time-label">Execution:</span>
                    <span>${attempt.executionTime !== null ? (attempt.executionTime / 1000).toFixed(2) + 's' : 'N/A'}</span>
                </div>
            </div>
        </div>
        <div class="attempt-header-right">
            <div class="badge ${getStatusBadgeClass(attempt.status)}">${formatStatus(attempt.status)}</div>
            <span class="expand-icon-small">▼</span>
        </div>
    `;
    
    const attemptBody = document.createElement('div');
    attemptBody.className = 'attempt-body';
    attemptBody.style.display = 'none';
    
    let html = `
        
        <div class="attempt-status">
            <div class="status-item">
                <div class="status-item-label">Build</div>
                <div class="status-item-value">${getStatusIcon(attempt.buildSuccess)} ${attempt.buildSuccess ? 'Success' : 'Failed'}</div>
            </div>
            <div class="status-item">
                <div class="status-item-label">Execution</div>
                <div class="status-item-value">${getStatusIcon(attempt.executionSuccess)} ${attempt.executionSuccess ? 'Success' : 'Failed'}</div>
            </div>
            <div class="status-item">
                <div class="status-item-label">Validation Func</div>
                <div class="status-item-value">${getStatusIcon(attempt.validationFunctionPassed)} ${formatValidationFuncStatus(attempt.validationFunctionPassed)}</div>
            </div>
        </div>
    `;
    
    // Add instruction
    if (attempt.instruction) {
        html += `
            <div class="instruction-box">
                <strong>Instruction:</strong> ${escapeHtml(attempt.instruction)}
            </div>
        `;
    }
    
    // Add description if present
    if (attempt.description) {
        html += `
            <div class="description-box">
                <strong>Expected Result:</strong> ${escapeHtml(attempt.description)}
            </div>
        `;
    }
    
    // Build error
    if (attempt.buildError) {
        html += `
            <div class="error-section">
                <div class="error-title">Build Error</div>
                <div class="error-content">${escapeHtml(attempt.buildError)}</div>
            </div>
        `;
    }
    
    // Execution error
    if (attempt.executionError) {
        html += `
            <div class="error-section">
                <div class="error-title">Execution Error</div>
                <div class="error-content">${escapeHtml(attempt.executionError)}</div>
            </div>
        `;
    }
    
    // Validation function error
    if (attempt.validationFunctionError) {
        html += `
            <div class="error-section">
                <div class="error-title">Validation Function Error</div>
                <div class="error-content">${escapeHtml(attempt.validationFunctionError)}</div>
            </div>
        `;
    }
    
    // LLM judgment
    if (attempt.llmJudgment) {
        html += `
            <div class="llm-section">
                <div class="llm-title">LLM Judge</div>
                <div class="llm-judgment">
                    <span class="badge ${getLLMBadgeClass(attempt.llmJudgment)}">${formatLLMJudgment(attempt.llmJudgment)}</span>
                </div>
                ${attempt.llmReason ? `<div class="llm-reason">"${escapeHtml(attempt.llmReason)}"</div>` : ''}
            </div>
        `;
    }
    
    // Output data
    if (attempt.data !== null) {
        const jsonString = JSON.stringify(attempt.data, null, 2);
        html += `
            <div class="data-section">
                <div class="data-header">
                    <div class="data-title">Output Data</div>
                    <button class="copy-button" onclick="copyToClipboard('${attemptId}')">Copy JSON</button>
                </div>
                <div class="json-viewer">
                    <pre id="${attemptId}">${escapeHtml(jsonString)}</pre>
                </div>
            </div>
        `;
    }
    
    attemptBody.innerHTML = html;
    
    // Toggle collapse/expand
    attemptHeader.addEventListener('click', () => {
        const isExpanded = attemptBody.style.display !== 'none';
        attemptBody.style.display = isExpanded ? 'none' : 'block';
        attemptHeader.querySelector('.expand-icon-small').textContent = isExpanded ? '▼' : '▲';
    });
    
    card.appendChild(attemptHeader);
    card.appendChild(attemptBody);
    
    return card;
}

function getStatusBadgeClass(status) {
    if (!status) return 'badge-neutral';
    if (status.includes('passed')) return 'badge-success';
    if (status.includes('partial')) return 'badge-partial';
    if (status.includes('failed')) return 'badge-failure';
    return 'badge-neutral';
}

function getLLMBadgeClass(judgment) {
    if (judgment === 'passes') return 'badge-success';
    if (judgment === 'partial') return 'badge-partial';
    return 'badge-failure';
}

function formatStatus(status) {
    if (!status) return 'Unknown';
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatLLMJudgment(judgment) {
    if (judgment === 'passes') return '✓ Passes';
    if (judgment === 'partial') return '~ Partial';
    return '✗ Failed';
}

function getStatusIcon(success) {
    if (success === null) return '-';
    return success ? '✓' : '✗';
}

function formatBooleanStatus(value) {
    if (value === null) return 'N/A';
    return value ? 'Passed' : 'Failed';
}

function formatValidationFuncStatus(value) {
    if (value === null) return 'N/A';
    return value ? 'Passed' : 'Failed';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        // Visual feedback
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.style.backgroundColor = '#28a745';
        setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '#FFA500';
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// Load benchmark CSV (only works when served via HTTP, not file://)
async function loadBenchmarkCsv() {
    try {
        const response = await fetch('../data/benchmark/tool-eval-benchmark.csv');
        if (!response.ok) {
            console.log('No benchmark file available - use file input to load manually');
            return;
        }
        
        const csvText = await response.text();
        benchmarkData = parseBenchmarkCsv(csvText);
        console.log('Benchmark auto-loaded:', benchmarkData.length, 'rows');
    } catch (error) {
        console.log('Benchmark auto-load failed (expected with file:// protocol) - use file input to load manually');
    }
}

function parseBenchmarkCsv(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',');
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCsvLine(line);
        if (values.length < 6) continue;
        
        const row = {
            tool_id: unquote(values[0]),
            tool_name: unquote(values[1]),
            mode: values[2],
            success: values[3] === 'true',
            avg_build_time_ms: parseFloat(values[4]) || null,
            avg_exec_time_ms: parseFloat(values[5]) || null
        };
        
        rows.push(row);
    }
    
    return rows;
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    values.push(current);
    return values;
}

function unquote(str) {
    if (str.startsWith('"') && str.endsWith('"')) {
        return str.slice(1, -1).replace(/""/g, '"');
    }
    return str;
}

// Auto-load latest result if available (optional)
async function tryLoadLatestResult() {
    try {
        // Try to load a default file - user can adjust this path
        const response = await fetch('../data/results/tool-eval-latest.json');
        if (response.ok) {
            const data = await response.json();
            currentData = data;
            renderDashboard(data);
        }
    } catch (error) {
        // Silently fail - user will load file manually
        console.log('No default file available, please select a file');
    }
}

// Load benchmark and try to auto-load on page load
loadBenchmarkCsv();
tryLoadLatestResult();

