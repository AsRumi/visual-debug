const vscode = require("vscode");
const VisualizationServer = require("./server");
const CodeParser = require("./parser");
const { exec } = require("child_process");

// Store webview panel and server globally
let visualDebugPanel = null;
let server = null;
let parser = null;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log("Visual Debug extension is now active!");

  // Initialize server and parser
  server = new VisualizationServer();
  parser = new CodeParser();

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
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active file to debug");
        return;
      }

      // Get the current file content
      const document = editor.document;
      const code = document.getText();

      try {
        // Parse the code
        const operations = parser.parse(code);

        // Create webview if it doesn't exist
        if (!visualDebugPanel) {
          createWebviewPanel(context);
        }

        // Send operations to webview
        if (visualDebugPanel) {
          visualDebugPanel.webview.postMessage({
            type: "operations",
            operations: operations,
            code: code,
            fileName: document.fileName,
          });
        }

        // Also send to browser if server is running
        server.sendOperations(operations);

        vscode.window.showInformationMessage(
          `Visualizing ${operations.length} operations`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to parse code: ${error.message}`
        );
      }
    }
  );

  // Register command to visualize algorithm
  let visualizeAlgorithmCommand = vscode.commands.registerCommand(
    "visual-debug.visualizeAlgorithm",
    async () => {
      // Show quick pick for algorithm selection
      const algorithmChoice = await vscode.window.showQuickPick(
        [
          { label: "Bubble Sort", value: "bubbleSort" },
          { label: "Selection Sort", value: "selectionSort" },
          { label: "Insertion Sort", value: "insertionSort" },
          { label: "Custom Code", value: "custom" },
        ],
        {
          placeHolder: "Select an algorithm to visualize",
        }
      );

      if (!algorithmChoice) return;

      if (algorithmChoice.value === "custom") {
        // Prompt for custom array
        const arrayInput = await vscode.window.showInputBox({
          prompt: "Enter array values (comma-separated numbers)",
          placeHolder: "e.g., 64, 34, 25, 12, 22, 11, 90",
          value: "64, 34, 25, 12, 22, 11, 90",
        });

        if (!arrayInput) return;

        const array = arrayInput
          .split(",")
          .map((n) => parseInt(n.trim()))
          .filter((n) => !isNaN(n));

        if (array.length === 0) {
          vscode.window.showErrorMessage("Invalid array input");
          return;
        }

        // Prompt for code
        const code = await vscode.window.showInputBox({
          prompt: "Enter your sorting code (use 'arr' as array name)",
          placeHolder: "e.g., for(let i=0; i<arr.length; i++) { ... }",
          value: "",
        });

        if (!code) return;

        try {
          // Replace placeholder with actual array
          const fullCode = `let arr = [${array.join(", ")}];\n${code}`;
          const operations = parser.parse(fullCode);

          sendOperationsToVisualization(operations);
          vscode.window.showInformationMessage(
            `Visualizing custom code with ${operations.length} operations`
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to parse code: ${error.message}`
          );
        }
      } else {
        // Generate operations for selected algorithm
        const arrayInput = await vscode.window.showInputBox({
          prompt: "Enter array values (comma-separated numbers)",
          placeHolder: "e.g., 64, 34, 25, 12, 22, 11, 90",
          value: "64, 34, 25, 12, 22, 11, 90",
        });

        if (!arrayInput) return;

        const array = arrayInput
          .split(",")
          .map((n) => parseInt(n.trim()))
          .filter((n) => !isNaN(n));

        if (array.length === 0) {
          vscode.window.showErrorMessage("Invalid array input");
          return;
        }

        let operations = [];
        switch (algorithmChoice.value) {
          case "bubbleSort":
            operations = parser.generateBubbleSort(array);
            break;
          case "selectionSort":
            operations = parser.generateSelectionSort(array);
            break;
          case "insertionSort":
            operations = parser.generateInsertionSort(array);
            break;
        }

        sendOperationsToVisualization(operations);
        vscode.window.showInformationMessage(
          `Visualizing ${algorithmChoice.label} with ${operations.length} operations`
        );
      }
    }
  );

  function sendOperationsToVisualization(operations) {
    // Create webview if it doesn't exist
    if (!visualDebugPanel) {
      createWebviewPanel(context);
    }

    // Send to webview
    if (visualDebugPanel) {
      visualDebugPanel.webview.postMessage({
        type: "operations",
        operations: operations,
      });
    }

    // Send to browser
    server.sendOperations(operations);
  }

  context.subscriptions.push(
    startCommand,
    openInBrowserCommand,
    debugFileCommand,
    visualizeAlgorithmCommand
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
          const testArray = [64, 34, 25, 12, 22, 11, 90];
          const operations = parser.generateBubbleSort(testArray);
          visualDebugPanel.webview.postMessage({
            type: "operations",
            operations: operations,
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
        case "visualizeCode":
          // User entered code in webview
          try {
            const operations = parser.parse(message.code);
            visualDebugPanel.webview.postMessage({
              type: "operations",
              operations: operations,
            });
            server.sendOperations(operations);
          } catch (error) {
            visualDebugPanel.webview.postMessage({
              type: "error",
              message: error.message,
            });
          }
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

            #code-input-section {
                margin-bottom: 20px;
                padding: 15px;
                background: #2d2d30;
                border-radius: 8px;
            }

            #code-input-section h3 {
                margin: 0 0 10px 0;
                color: #9999ff;
            }

            #code-textarea {
                width: 100%;
                min-height: 120px;
                padding: 10px;
                background: #1e1e1e;
                color: #cccccc;
                border: 1px solid #3e3e42;
                border-radius: 4px;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 13px;
                resize: vertical;
            }

            #visualize-btn {
                margin-top: 10px;
                padding: 8px 16px;
                background: #4ec9b0;
                color: #1e1e1e;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
            }

            #visualize-btn:hover {
                background: #5ed9c0;
            }

            .code-example {
                font-size: 12px;
                color: #888;
                margin-top: 5px;
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

            .error-message {
                background: #ff646422;
                border: 1px solid #ff646444;
                padding: 12px;
                border-radius: 6px;
                margin-top: 10px;
                color: #ff9999;
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

        <div id="code-input-section">
            <h3>📝 Enter Your Code</h3>
            <textarea id="code-textarea" placeholder="let arr = [64, 34, 25, 12, 22, 11, 90];

// Bubble Sort
for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length - i - 1; j++) {
        if (arr[j] > arr[j + 1]) {
            [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        }
    }
}"></textarea>
            <div class="code-example">
                Example: Initialize an array and write sorting logic. Use array operations like comparisons and swaps.
            </div>
            <button id="visualize-btn">🚀 Visualize Code</button>
            <div id="error-display"></div>
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

            // Visualize button
            document.getElementById('visualize-btn').addEventListener('click', () => {
                const code = document.getElementById('code-textarea').value;
                const errorDisplay = document.getElementById('error-display');
                errorDisplay.innerHTML = '';

                if (!code.trim()) {
                    errorDisplay.innerHTML = '<div class="error-message">Please enter some code to visualize</div>';
                    return;
                }

                vscode.postMessage({ type: 'visualizeCode', code: code });
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
                    if (index >= 0 && index < array.length) {
                        const value = array[index];
                        const barHeight = (value / maxValue) * (canvas.height - 40);
                        const x = 10 + index * (barWidth + 2);
                        const y = canvas.height - barHeight - 20;
                        
                        ctx.fillStyle = color;
                        ctx.fillRect(x, y, barWidth, barHeight);
                    }
                });
            }
            
            function animateSwap(i, j) {
                if (i >= 0 && i < array.length && j >= 0 && j < array.length) {
                    [array[i], array[j]] = [array[j], array[i]];
                    draw();
                    highlightBars([i, j], '#f48771');
                }
            }
            
            function animateCompare(i, j) {
                draw();
                highlightBars([i, j], '#ffcc00');
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
                if (operations.length > 0 && operations[0].array) {
                    array = [...operations[0].array];
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
                    case 'sorted':
                        draw();
                        highlightBars(op.indices, '#40ff40');
                        break;
                    case 'init':
                        array = [...op.array];
                        draw();
                        break;
                    case 'complete':
                        array.forEach((_, i) => highlightBars([i], '#40ff40'));
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
                        case 'sorted':
                            message = \`Element at position \${op.indices[0]} is sorted\`;
                            break;
                        case 'complete':
                            message = 'Sorting complete! ✨';
                            break;
                        default:
                            message = \`Operation: \${op.type}\`;
                    }
                    infoDiv.textContent = \`Step \${currentStep + 1}/\${operations.length}: \${message}\`;
                } else if (operations.length > 0) {
                    infoDiv.textContent = 'Visualization complete!';
                } else {
                    infoDiv.textContent = 'Ready to visualize...';
                }
                
                document.getElementById('array-info').textContent = \`Array: [\${array.join(', ')}]\`;
            }
            
            // Message handling
            window.addEventListener('message', event => {
                const message = event.data;
                const errorDisplay = document.getElementById('error-display');
                
                switch (message.type) {
                    case 'operations':
                        operations = message.operations;
                        currentStep = 0;
                        if (operations.length > 0 && operations[0].array) {
                            array = [...operations[0].array];
                        }
                        reset();
                        updateInfo();
                        errorDisplay.innerHTML = '';
                        vscode.postMessage({ type: 'log', data: 'Operations loaded: ' + operations.length });
                        break;
                    case 'error':
                        errorDisplay.innerHTML = '<div class="error-message">' + message.message + '</div>';
                        break;
                }
            });
            
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
