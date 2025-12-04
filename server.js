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
    this.connectedSockets = [];
    this.pendingOperations = null; // Store operations to send when client connects
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
        console.log("Browser visualizer connected:", socket.id);
        this.connectedSockets.push(socket);

        socket.on("ready", () => {
          console.log("Browser visualizer is ready:", socket.id);

          // If we have pending operations, send them
          if (this.pendingOperations) {
            console.log("Sending pending operations to newly connected client");
            socket.emit("operations", this.pendingOperations);
          } else {
            // Send initial test data
            this.sendInitialData(socket);
          }
        });

        socket.on("control", (data) => {
          console.log("Control command from browser:", data);
          // Handle control commands from browser
        });

        socket.on("disconnect", () => {
          console.log("Browser visualizer disconnected:", socket.id);
          this.connectedSockets = this.connectedSockets.filter(
            (s) => s.id !== socket.id
          );
        });

        socket.on("error", (error) => {
          console.error("Socket error:", error);
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
              console.log(`Port ${port} in use, trying ${port + 1}...`);
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
        // Close all socket connections
        this.connectedSockets.forEach((socket) => {
          socket.disconnect(true);
        });
        this.connectedSockets = [];

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

  sendInitialData(socket = null) {
    const data = {
      array: [64, 34, 25, 12, 22, 11, 90, 45, 33, 77],
      algorithm: "bubbleSort",
    };

    if (socket) {
      socket.emit("initialize", data);
    } else if (this.connectedSockets.length > 0) {
      this.connectedSockets.forEach((s) => s.emit("initialize", data));
    }
  }

  sendOperation(operation) {
    if (this.connectedSockets.length > 0) {
      this.connectedSockets.forEach((socket) => {
        socket.emit("operation", operation);
      });
    } else {
      console.log("No connected clients to send operation to");
    }
  }

  sendOperations(operations) {
    console.log(
      `Sending ${operations.length} operations to ${this.connectedSockets.length} client(s)`
    );

    // Store operations for newly connecting clients
    this.pendingOperations = operations;

    if (this.connectedSockets.length > 0) {
      this.connectedSockets.forEach((socket) => {
        socket.emit("operations", operations);
      });
    } else {
      console.log(
        "No connected clients yet. Operations will be sent when a client connects."
      );
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
