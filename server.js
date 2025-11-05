const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

class VisualizationServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });
    this.port = 3000;
    this.isRunning = false;
    this.currentSocket = null;
  }

  start() {
    if (this.isRunning) {
      return Promise.resolve(this.port);
    }

    return new Promise((resolve, reject) => {
      // Serve static files
      this.app.use(express.static(path.join(__dirname, "web")));

      // Main route
      this.app.get("/", (req, res) => {
        res.sendFile(path.join(__dirname, "web", "index.html"));
      });

      // Socket.io connection handling
      this.io.on("connection", (socket) => {
        console.log("Browser visualizer connected");
        this.currentSocket = socket;

        socket.on("ready", () => {
          console.log("Browser visualizer is ready");
          // Send initial test data
          this.sendInitialData();
        });

        socket.on("control", (data) => {
          console.log("Control command from browser:", data);
          // Handle control commands from browser
        });

        socket.on("disconnect", () => {
          console.log("Browser visualizer disconnected");
          this.currentSocket = null;
        });
      });

      // Try to start server, increment port if taken
      const tryPort = (port) => {
        this.server
          .listen(port, () => {
            this.port = port;
            this.isRunning = true;
            console.log(
              "Visualization server running on http://localhost:" + port
            );
            resolve(port);
          })
          .on("error", (err) => {
            // @ts-ignore
            if (err && err.code === "EADDRINUSE" && port < 3010) {
              // Try next port
              tryPort(port + 1);
            } else {
              reject(err);
            }
          });
      };

      tryPort(this.port);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.isRunning) {
        this.server.close(() => {
          this.isRunning = false;
          console.log("Visualization server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  sendInitialData() {
    if (this.currentSocket) {
      this.currentSocket.emit("initialize", {
        array: [64, 34, 25, 12, 22, 11, 90, 45, 33, 77],
        algorithm: "bubbleSort",
      });
    }
  }

  sendOperation(operation) {
    if (this.currentSocket) {
      this.currentSocket.emit("operation", operation);
    }
  }

  sendOperations(operations) {
    if (this.currentSocket) {
      this.currentSocket.emit("operations", operations);
    }
  }

  // Generate bubble sort operations for testing
  generateBubbleSortOperations(arr) {
    const operations = [];
    const testArray = [...arr];
    operations.push({ type: "init", array: [...arr] });

    for (let i = 0; i < testArray.length; i++) {
      for (let j = 0; j < testArray.length - i - 1; j++) {
        operations.push({
          type: "compare",
          indices: [j, j + 1],
          values: [testArray[j], testArray[j + 1]],
        });

        if (testArray[j] > testArray[j + 1]) {
          operations.push({
            type: "swap",
            indices: [j, j + 1],
            values: [testArray[j], testArray[j + 1]],
          });
          [testArray[j], testArray[j + 1]] = [testArray[j + 1], testArray[j]];
        }
      }

      // Mark the last element as sorted after each pass
      operations.push({
        type: "sorted",
        indices: [testArray.length - i - 1],
      });
    }

    operations.push({ type: "complete" });
    return operations;
  }
}

module.exports = VisualizationServer;
