# Tool Evaluation Dashboard

Simple HTML dashboard to visualize tool evaluation results.

## Usage

1. Open `index.html` in your browser
2. Click "Load Results JSON" and select a results file from `../data/results/`
3. View metrics and drill down into individual tool attempts

## Features

### Metrics Overview

- Success rates for one-shot and self-healing modes
- Average and median build/execution times
- Configuration information

### Tool Attempts

- Grouped by tool ID
- Expandable to show attempt details
- Separate tabs for one-shot vs self-healing attempts
- Status indicators:
  - **B**: Build success ✓/✗
  - **E**: Execution success ✓/✗
  - **V**: Validation function ✓/✗/-
  - **LLM**: LLM judgment ✓/~/✗/-

### Attempt Details

- Build/execution errors
- Validation function errors
- LLM judgment and reasoning
- Full JSON output data (copyable)

## Color Coding

- 🟢 Green: Success
- 🔴 Red: Failure
- 🟠 Orange: Partial/Warning
- ⚪ Gray: Not applicable

## Files

- `index.html` - Main dashboard page
- `dashboard.js` - Data loading and rendering logic
- `styles.css` - Styling (light mode, #FFA500 accent)
