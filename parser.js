const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

class CodeParser {
  constructor() {
    this.operations = [];
    this.currentArray = [];
    this.arrayName = null;
  }

  /**
   * Parse JavaScript code and extract array operations
   * @param {string} code - The JavaScript code to parse
   * @returns {Array} - Array of visualization operations
   */
  parse(code) {
    this.operations = [];
    this.currentArray = [];
    this.arrayName = null;

    try {
      // Parse the code into an AST
      const ast = parser.parse(code, {
        sourceType: "module",
        plugins: ["jsx"],
      });

      // First pass: Find array initialization
      this.findArrayInitialization(ast);

      if (!this.arrayName || this.currentArray.length === 0) {
        throw new Error(
          "No array found. Please initialize an array like: let arr = [1, 2, 3]"
        );
      }

      // Add initial state
      this.operations.push({
        type: "init",
        array: [...this.currentArray],
      });

      // Second pass: Extract operations
      this.extractOperations(ast);

      return this.operations;
    } catch (error) {
      console.error("Parse error:", error);
      throw error;
    }
  }

  findArrayInitialization(ast) {
    traverse(ast, {
      VariableDeclarator: (path) => {
        const { id, init } = path.node;

        // Look for array initialization: let arr = [...]
        if (
          init &&
          init.type === "ArrayExpression" &&
          id.type === "Identifier"
        ) {
          this.arrayName = id.name;
          this.currentArray = init.elements.map((el) => {
            if (el.type === "NumericLiteral") {
              return el.value;
            }
            return 0;
          });
        }
      },
    });
  }

  extractOperations(ast) {
    traverse(ast, {
      // Detect for loops (common in sorting algorithms)
      ForStatement: (path) => {
        this.handleForLoop(path);
      },

      // Detect array element access for comparison
      BinaryExpression: (path) => {
        if (this.isArrayComparison(path.node)) {
          const indices = this.getComparisonIndices(path.node);
          if (indices.length === 2) {
            this.operations.push({
              type: "compare",
              indices: indices,
              values: indices.map((i) => this.currentArray[i]),
            });
          }
        }
      },

      // Detect swap operations
      ExpressionStatement: (path) => {
        if (this.isSwapOperation(path.node)) {
          const indices = this.getSwapIndices(path.node);
          if (indices && indices.length === 2) {
            this.operations.push({
              type: "swap",
              indices: indices,
              values: [
                this.currentArray[indices[0]],
                this.currentArray[indices[1]],
              ],
            });
            // Update the simulated array
            [this.currentArray[indices[0]], this.currentArray[indices[1]]] = [
              this.currentArray[indices[1]],
              this.currentArray[indices[0]],
            ];
          }
        }
      },

      // Detect array assignment
      AssignmentExpression: (path) => {
        if (this.isArrayAssignment(path.node)) {
          const { index, value } = this.getAssignmentDetails(path.node);
          if (index !== null && value !== null) {
            this.operations.push({
              type: "set",
              indices: [index],
              value: value,
            });
            this.currentArray[index] = value;
          }
        }
      },
    });

    // Add completion marker
    this.operations.push({ type: "complete" });
  }

  handleForLoop(path) {
    // This is a simplified handler - in a full implementation,
    // we would need to actually execute the loop logic
    // For now, we'll just note that we're entering a loop
    this.operations.push({
      type: "comment",
      message: "Entering loop",
    });
  }

  isArrayComparison(node) {
    if (node.type !== "BinaryExpression") return false;

    const { left, right, operator } = node;
    const comparisonOps = [">", "<", ">=", "<=", "==", "===", "!=", "!=="];

    return (
      comparisonOps.includes(operator) &&
      (this.isArrayAccess(left) || this.isArrayAccess(right))
    );
  }

  isArrayAccess(node) {
    return (
      node &&
      node.type === "MemberExpression" &&
      node.object.type === "Identifier" &&
      node.object.name === this.arrayName
    );
  }

  getComparisonIndices(node) {
    const indices = [];
    const { left, right } = node;

    if (this.isArrayAccess(left) && left.property.type === "NumericLiteral") {
      indices.push(left.property.value);
    } else if (
      this.isArrayAccess(left) &&
      left.property.type === "Identifier"
    ) {
      // Handle variable indices - for now, we'll use 0 as placeholder
      indices.push(0);
    }

    if (this.isArrayAccess(right) && right.property.type === "NumericLiteral") {
      indices.push(right.property.value);
    } else if (
      this.isArrayAccess(right) &&
      right.property.type === "Identifier"
    ) {
      indices.push(1);
    }

    return indices;
  }

  isSwapOperation(node) {
    // Detect: [arr[i], arr[j]] = [arr[j], arr[i]]
    if (
      node.expression &&
      node.expression.type === "AssignmentExpression" &&
      node.expression.left.type === "ArrayPattern" &&
      node.expression.right.type === "ArrayExpression"
    ) {
      return true;
    }
    return false;
  }

  getSwapIndices(node) {
    try {
      const left = node.expression.left.elements;
      const right = node.expression.right.elements;

      if (left.length === 2 && right.length === 2) {
        const i1 = this.getIndexFromArrayAccess(left[0]);
        const i2 = this.getIndexFromArrayAccess(left[1]);

        if (i1 !== null && i2 !== null) {
          return [i1, i2];
        }
      }
    } catch (error) {
      console.error("Error getting swap indices:", error);
    }
    return null;
  }

  isArrayAssignment(node) {
    return (
      node.type === "AssignmentExpression" &&
      node.left.type === "MemberExpression" &&
      node.left.object.name === this.arrayName
    );
  }

  getAssignmentDetails(node) {
    const index = this.getIndexFromArrayAccess(node.left);
    let value = null;

    if (node.right.type === "NumericLiteral") {
      value = node.right.value;
    }

    return { index, value };
  }

  getIndexFromArrayAccess(node) {
    if (!node || !node.property) return null;

    if (node.property.type === "NumericLiteral") {
      return node.property.value;
    } else if (node.property.type === "Identifier") {
      // For variable indices, we'll need more context
      // For now, return null
      return null;
    }
    return null;
  }

  /**
   * Generate operations for common algorithms
   */
  generateBubbleSort(array) {
    this.currentArray = [...array];
    this.operations = [{ type: "init", array: [...array] }];

    const arr = [...array];
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr.length - i - 1; j++) {
        this.operations.push({
          type: "compare",
          indices: [j, j + 1],
          values: [arr[j], arr[j + 1]],
        });

        if (arr[j] > arr[j + 1]) {
          this.operations.push({
            type: "swap",
            indices: [j, j + 1],
            values: [arr[j], arr[j + 1]],
          });
          [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        }
      }

      this.operations.push({
        type: "sorted",
        indices: [arr.length - i - 1],
      });
    }

    this.operations.push({ type: "complete" });
    return this.operations;
  }

  generateSelectionSort(array) {
    this.currentArray = [...array];
    this.operations = [{ type: "init", array: [...array] }];

    const arr = [...array];
    for (let i = 0; i < arr.length - 1; i++) {
      let minIdx = i;

      this.operations.push({
        type: "highlight",
        indices: [i],
        color: 0xffaa00,
      });

      for (let j = i + 1; j < arr.length; j++) {
        this.operations.push({
          type: "compare",
          indices: [minIdx, j],
          values: [arr[minIdx], arr[j]],
        });

        if (arr[j] < arr[minIdx]) {
          minIdx = j;
        }
      }

      if (minIdx !== i) {
        this.operations.push({
          type: "swap",
          indices: [i, minIdx],
          values: [arr[i], arr[minIdx]],
        });
        [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
      }

      this.operations.push({
        type: "sorted",
        indices: [i],
      });
    }

    this.operations.push({
      type: "sorted",
      indices: [arr.length - 1],
    });

    this.operations.push({ type: "complete" });
    return this.operations;
  }

  generateInsertionSort(array) {
    this.currentArray = [...array];
    this.operations = [{ type: "init", array: [...array] }];

    const arr = [...array];
    for (let i = 1; i < arr.length; i++) {
      const key = arr[i];
      let j = i - 1;

      this.operations.push({
        type: "highlight",
        indices: [i],
        color: 0xffaa00,
      });

      while (j >= 0 && arr[j] > key) {
        this.operations.push({
          type: "compare",
          indices: [j, j + 1],
          values: [arr[j], key],
        });

        this.operations.push({
          type: "swap",
          indices: [j, j + 1],
          values: [arr[j], arr[j + 1]],
        });

        arr[j + 1] = arr[j];
        j--;
      }

      arr[j + 1] = key;

      this.operations.push({
        type: "sorted",
        indices: [j + 1],
      });
    }

    this.operations.push({ type: "complete" });
    return this.operations;
  }
}

module.exports = CodeParser;
