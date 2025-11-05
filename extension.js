const vscode = require("vscode");
const VisualizationServer = require("./server");
const { exec } = require("child_process");

// Store webview panel and server globally
let visualDebugPanel = null;
let server = null;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log("Visual Debug extension is now active!");

  // Initialize server
  server = new VisualizationServer();

  // Register command to start visual debugging in VS Code
  let startCommand = vscode.commands.registerCommand(
    "visual-debug.start",
    () => {
      // Create or show the webview panel
      if (visualDebugPanel) {
        visualDebugPanel.reveal();
      } else {
        createWebviewPanel(context);
      }
    }
  );

  // Register command to open in browser
  let openInBrowserCommand = vscode.commands.registerCommand(
    "visual-debug.openInBrowser",
    async () => {
      try {
        // Start the server if not already running
        const port = await server.start();

        // Open in default browser
        const url = `http://localhost:${port}`;
        const platform = process.platform;

        // Platform-specific command to open browser
        let command;
        if (platform === "darwin") {
          command = `open ${url}`;
        } else if (platform === "win32") {
          command = `start ${url}`;
        } else {
          command = `xdg-open ${url}`;
        }

        exec(command, (error) => {
          if (error) {
            vscode.window.showErrorMessage(
              `Failed to open browser: ${error.message}`
            );
          } else {
            vscode.window.showInformationMessage(
              `Visual Debug opened in browser at ${url}`
            );

            // After browser opens, send test data
            setTimeout(() => {
              const testArray = [64, 34, 25, 12, 22, 11, 90, 45, 33, 77];
              const operations = server.generateBubbleSortOperations(testArray);
              server.sendOperations(operations);
            }, 2000);
          }
        });
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to start visualization server: ${error.message}`
        );
      }
    }
  );

  // Register command to debug current file
  let debugFileCommand = vscode.commands.registerCommand(
    "visual-debug.debugCurrentFile",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active file to debug");
        return;
      }

      // Get the current file content
      const document = editor.document;
      const code = document.getText();

      // Create webview if it doesn't exist
      if (!visualDebugPanel) {
        createWebviewPanel(context);
      }

      // Send the code to the webview for visualization
      if (visualDebugPanel) {
        visualDebugPanel.webview.postMessage({
          type: "loadCode",
          code: code,
          fileName: document.fileName,
        });
      }
    }
  );

  context.subscriptions.push(
    startCommand,
    openInBrowserCommand,
    debugFileCommand
  );

  // Clean up when extension is deactivated
  context.subscriptions.push({
    dispose: () => {
      if (visualDebugPanel) {
        visualDebugPanel.dispose();
      }
      if (server) {
        server.stop();
      }
    },
  });
}

function createWebviewPanel(context) {
  // Create webview panel
  visualDebugPanel = vscode.window.createWebviewPanel(
    "visualDebug",
    "Visual Debug",
    vscode.ViewColumn.Two, // Opens beside the editor
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Load the webview content
  visualDebugPanel.webview.html = getWebviewContent();

  // Handle messages from the webview
  visualDebugPanel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.type) {
        case "ready":
          console.log("Webview is ready");
          // Send initial test data
          visualDebugPanel.webview.postMessage({
            type: "initialize",
            data: {
              array: [64, 34, 25, 12, 22, 11, 90],
              algorithm: "bubbleSort",
            },
          });
          break;
        case "openInBrowser":
          vscode.commands.executeCommand("visual-debug.openInBrowser");
          break;
        case "log":
          console.log("Webview:", message.data);
          break;
        case "error":
          vscode.window.showErrorMessage(`Visual Debug Error: ${message.data}`);
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  // Clean up when panel is closed
  visualDebugPanel.onDidDispose(
    () => {
      visualDebugPanel = null;
    },
    null,
    context.subscriptions
  );
}

function getWebviewContent() {
  return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Visual Debug</title>
        <style>
            body {
                margin: 0;
                padding: 20px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                background: #1e1e1e;
                color: #cccccc;
            }
            
            #header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding: 15px;
                background: #2d2d30;
                border-radius: 8px;
            }
            
            #open-browser-btn {
                padding: 10px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: transform 0.2s;
            }
            
            #open-browser-btn:hover {
                transform: translateY(-2px);
            }
            
            #canvas-container {
                width: 100%;
                height: 400px;
                background: #2d2d30;
                border-radius: 8px;
                padding: 20px;
                box-sizing: border-box;
                margin-bottom: 20px;
            }
            
            canvas {
                width: 100%;
                height: 100%;
                display: block;
            }
            
            #controls {
                display: flex;
                gap: 10px;
                align-items: center;
                padding: 15px;
                background: #2d2d30;
                border-radius: 8px;
            }
            
            button {
                padding: 8px 16px;
                background: #007acc;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }
            
            button:hover {
                background: #005a9e;
            }
            
            button:disabled {
                background: #3e3e42;
                cursor: not-allowed;
            }
            
            #speed-control {
                margin-left: auto;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            #speed-slider {
                width: 100px;
            }
            
            #info {
                margin-top: 20px;
                padding: 15px;
                background: #2d2d30;
                border-radius: 8px;
                font-family: 'Consolas', 'Courier New', monospace;
            }
            
            .notice {
                background: linear-gradient(135deg, #667eea22 0%, #764ba222 100%);
                border: 1px solid #667eea44;
                padding: 12px;
                border-radius: 6px;
                margin-bottom: 10px;
            }
        </style>
    </head>
    <body>
        <div id="header">
            <div>
                <h2 style="margin: 0;">Visual Debug - Quick View</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.7; font-size: 14px;">Simple visualization in VS Code</p>
            </div>
            <button id="open-browser-btn">✨ Open Full 3D View in Browser</button>
        </div>
        
        <div class="notice">
            💡 For the best experience with smooth 3D animations, click "Open Full 3D View in Browser" above!
        </div>
        
        <div id="canvas-container">
            <canvas id="visualizer"></canvas>
        </div>
        
        <div id="controls">
            <button id="play-pause">Play</button>
            <button id="step-forward">Step →</button>
            <button id="step-backward">← Step</button>
            <button id="reset">Reset</button>
            
            <div id="speed-control">
                <label for="speed-slider">Speed:</label>
                <input type="range" id="speed-slider" min="0.5" max="5" step="0.5" value="1">
                <span id="speed-value">1x</span>
            </div>
        </div>
        
        <div id="info">
            <div id="operation-info">Ready to visualize...</div>
            <div id="array-info"></div>
        </div>
        
        <script>
            const vscode = acquireVsCodeApi();
            const canvas = document.getElementById('visualizer');
            const ctx = canvas.getContext('2d');
            
            // State
            let array = [];
            let currentStep = 0;
            let isPlaying = false;
            let animationSpeed = 1;
            let operations = [];
            
            // Open in browser button
            document.getElementById('open-browser-btn').addEventListener('click', () => {
                vscode.postMessage({ type: 'openInBrowser' });
            });
            
            // Set canvas size
            function resizeCanvas() {
                const container = document.getElementById('canvas-container');
                canvas.width = container.clientWidth - 40;
                canvas.height = container.clientHeight - 40;
                draw();
            }
            
            window.addEventListener('resize', resizeCanvas);
            resizeCanvas();
            
            // Drawing functions
            function draw() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                if (array.length === 0) return;
                
                const barWidth = (canvas.width - 20) / array.length - 2;
                const maxValue = Math.max(...array);
                
                array.forEach((value, index) => {
                    const barHeight = (value / maxValue) * (canvas.height - 40);
                    const x = 10 + index * (barWidth + 2);
                    const y = canvas.height - barHeight - 20;
                    
                    // Default color
                    ctx.fillStyle = '#4ec9b0';
                    
                    // Draw bar
                    ctx.fillRect(x, y, barWidth, barHeight);
                    
                    // Draw value on top if bar is wide enough
                    if (barWidth > 20) {
                        ctx.fillStyle = '#cccccc';
                        ctx.font = '12px monospace';
                        ctx.textAlign = 'center';
                        ctx.fillText(value, x + barWidth / 2, y - 5);
                    }
                });
            }
            
            // Animation functions
            function highlightBars(indices, color) {
                const barWidth = (canvas.width - 20) / array.length - 2;
                const maxValue = Math.max(...array);
                
                indices.forEach(index => {
                    const value = array[index];
                    const barHeight = (value / maxValue) * (canvas.height - 40);
                    const x = 10 + index * (barWidth + 2);
                    const y = canvas.height - barHeight - 20;
                    
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, barWidth, barHeight);
                });
            }
            
            function animateSwap(i, j) {
                // Simple swap for now - we'll add smooth animation later
                [array[i], array[j]] = [array[j], array[i]];
                draw();
                highlightBars([i, j], '#f48771'); // Highlight swapped elements
            }
            
            function animateCompare(i, j) {
                draw();
                highlightBars([i, j], '#ffcc00'); // Yellow for comparison
            }
            
            // Control handlers
            document.getElementById('play-pause').addEventListener('click', () => {
                isPlaying = !isPlaying;
                document.getElementById('play-pause').textContent = isPlaying ? 'Pause' : 'Play';
                if (isPlaying) {
                    playAnimation();
                }
            });
            
            document.getElementById('step-forward').addEventListener('click', () => {
                stepForward();
            });
            
            document.getElementById('step-backward').addEventListener('click', () => {
                stepBackward();
            });
            
            document.getElementById('reset').addEventListener('click', () => {
                reset();
            });
            
            document.getElementById('speed-slider').addEventListener('input', (e) => {
                animationSpeed = parseFloat(e.target.value);
                document.getElementById('speed-value').textContent = animationSpeed + 'x';
            });
            
            function stepForward() {
                if (currentStep < operations.length) {
                    executeOperation(operations[currentStep]);
                    currentStep++;
                    updateInfo();
                }
            }
            
            function stepBackward() {
                // For now, just reset and replay to previous step
                // We'll implement proper backward stepping later
                if (currentStep > 0) {
                    const targetStep = currentStep - 1;
                    reset();
                    for (let i = 0; i < targetStep; i++) {
                        executeOperation(operations[i]);
                    }
                    currentStep = targetStep;
                    updateInfo();
                }
            }
            
            function reset() {
                currentStep = 0;
                isPlaying = false;
                document.getElementById('play-pause').textContent = 'Play';
                if (operations.length > 0 && operations[0].initialArray) {
                    array = [...operations[0].initialArray];
                    draw();
                }
                updateInfo();
            }
            
            function playAnimation() {
                if (!isPlaying || currentStep >= operations.length) {
                    isPlaying = false;
                    document.getElementById('play-pause').textContent = 'Play';
                    return;
                }
                
                stepForward();
                setTimeout(() => playAnimation(), 500 / animationSpeed);
            }
            
            function executeOperation(op) {
                switch (op.type) {
                    case 'compare':
                        animateCompare(op.indices[0], op.indices[1]);
                        break;
                    case 'swap':
                        animateSwap(op.indices[0], op.indices[1]);
                        break;
                    case 'highlight':
                        draw();
                        highlightBars(op.indices, op.color || '#4ec9b0');
                        break;
                }
            }
            
            function updateInfo() {
                const infoDiv = document.getElementById('operation-info');
                if (currentStep < operations.length) {
                    const op = operations[currentStep];
                    let message = '';
                    switch (op.type) {
                        case 'compare':
                            message = \`Comparing elements at positions \${op.indices[0]} and \${op.indices[1]}\`;
                            break;
                        case 'swap':
                            message = \`Swapping elements at positions \${op.indices[0]} and \${op.indices[1]}\`;
                            break;
                        default:
                            message = \`Operation: \${op.type}\`;
                    }
                    infoDiv.textContent = \`Step \${currentStep + 1}/\${operations.length}: \${message}\`;
                } else if (operations.length > 0) {
                    infoDiv.textContent = 'Sorting complete!';
                } else {
                    infoDiv.textContent = 'Ready to visualize...';
                }
                
                document.getElementById('array-info').textContent = \`Array: [\${array.join(', ')}]\`;
            }
            
            // Message handling
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'initialize':
                        array = [...message.data.array];
                        draw();
                        generateBubbleSortOperations(message.data.array);
                        updateInfo();
                        break;
                    case 'loadCode':
                        vscode.postMessage({ type: 'log', data: 'Code loaded: ' + message.fileName });
                        // We'll parse the code later
                        break;
                }
            });
            
            // Generate bubble sort operations for testing
            function generateBubbleSortOperations(arr) {
                operations = [];
                const testArray = [...arr];
                operations.push({ type: 'init', initialArray: [...arr] });
                
                for (let i = 0; i < testArray.length; i++) {
                    for (let j = 0; j < testArray.length - i - 1; j++) {
                        operations.push({ type: 'compare', indices: [j, j + 1] });
                        
                        if (testArray[j] > testArray[j + 1]) {
                            operations.push({ type: 'swap', indices: [j, j + 1] });
                            [testArray[j], testArray[j + 1]] = [testArray[j + 1], testArray[j]];
                        }
                    }
                }
            }
            
            // Tell the extension we're ready
            vscode.postMessage({ type: 'ready' });
        </script>
    </body>
    </html>`;
}

function deactivate() {
  if (visualDebugPanel) {
    visualDebugPanel.dispose();
  }
  if (server) {
    server.stop();
  }
}

module.exports = {
  activate,
  deactivate,
};
