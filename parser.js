// @ts-nocheck
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
      console.log("Parsing code:", code);

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

      console.log("Found array:", this.arrayName, "=", this.currentArray);

      // Add initial state
      this.operations.push({
        type: "init",
        array: [...this.currentArray],
      });

      // Second pass: Execute the code logic
      this.executeCode(ast);

      console.log(`Generated ${this.operations.length} operations`);
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
            if (el && el.type === "NumericLiteral") {
              return el.value;
            }
            return 0;
          });
        }
      },
    });
  }

  executeCode(ast) {
    // Extract the function/loop structure
    const forLoops = this.extractForLoops(ast);

    console.log("=== EXECUTE CODE DEBUG ===");
    console.log(`Found ${forLoops.length} top-level for loops`);

    if (forLoops.length === 0) {
      // No loops - just direct operations
      console.log("No loops found, extracting direct operations");
      this.extractDirectSwaps(ast);
    } else if (forLoops.length === 1) {
      // Single loop
      console.log("Single loop found");
      this.executeSingleLoop(forLoops[0]);
    } else if (forLoops.length >= 2) {
      // Nested loops
      console.log("Nested loops found");
      this.executeNestedLoops(forLoops);
    }

    console.log(`Total operations before complete: ${this.operations.length}`);

    // Add completion marker
    this.operations.push({ type: "complete" });

    console.log(`Final operation count: ${this.operations.length}`);
  }

  extractForLoops(ast) {
    const loops = [];

    traverse(ast, {
      ForStatement: (path) => {
        // Get all for loops at the top level (not inside functions)
        const functionParent = path.getFunctionParent();
        if (!functionParent) {
          loops.push({
            node: path.node,
            path: path,
            depth: 0,
          });
        }
      },
    });

    return loops;
  }

  executeSingleLoop(loopInfo) {
    const loop = loopInfo.node;

    // Get loop bounds
    let start = 0;
    let end = this.currentArray.length;

    // Check loop.init
    if (
      loop.init &&
      loop.init.type === "VariableDeclaration" &&
      loop.init.declarations &&
      loop.init.declarations.length > 0
    ) {
      const initValue = loop.init.declarations[0].init;
      if (initValue && initValue.type === "NumericLiteral") {
        start = initValue.value;
      }
    }

    // Check loop.test
    if (loop.test && loop.test.type === "BinaryExpression") {
      const testRight = loop.test.right;
      if (testRight) {
        if (testRight.type === "NumericLiteral") {
          end = testRight.value;
        } else if (testRight.type === "MemberExpression") {
          end = this.currentArray.length;
        } else if (testRight.type === "BinaryExpression") {
          end = this.currentArray.length - 1;
        }
      }
    }

    console.log(`Single loop: ${start} to ${end}`);

    // Execute loop
    for (let i = start; i < end; i++) {
      this.executeLoopBody(loop.body, { i: i });
    }
  }

  executeNestedLoops(loops) {
    // Assume first loop is outer, detect inner from body
    const outerLoop = loops[0].node;
    let innerLoopNode = null;

    // Find inner loop
    traverse(outerLoop.body, {
      ForStatement: (path) => {
        if (!innerLoopNode) {
          innerLoopNode = path.node;
        }
      },
    });

    if (!innerLoopNode) {
      console.log("No inner loop found, treating as single loop");
      this.executeSingleLoop(loops[0]);
      return;
    }

    // Get outer loop bounds
    let outerStart = 0;
    let outerEnd = this.currentArray.length;
    let outerVar = "i";

    if (
      outerLoop.init &&
      outerLoop.init.type === "VariableDeclaration" &&
      outerLoop.init.declarations &&
      outerLoop.init.declarations.length > 0
    ) {
      outerVar = outerLoop.init.declarations[0].id.name;
      const initValue = outerLoop.init.declarations[0].init;
      if (initValue && initValue.type === "NumericLiteral") {
        outerStart = initValue.value;
      }
    }

    if (outerLoop.test && outerLoop.test.type === "BinaryExpression") {
      const testRight = outerLoop.test.right;
      if (testRight) {
        if (testRight.type === "MemberExpression") {
          outerEnd = this.currentArray.length;
        } else if (testRight.type === "BinaryExpression") {
          outerEnd = this.currentArray.length - 1;
        }
      }
    }

    // Get inner loop bounds
    let innerStart = 0;
    let innerEndExpr = null;
    let innerVar = "j";
    let innerBoundUsesOuter = false;

    if (
      innerLoopNode.init &&
      innerLoopNode.init.type === "VariableDeclaration" &&
      innerLoopNode.init.declarations &&
      innerLoopNode.init.declarations.length > 0
    ) {
      innerVar = innerLoopNode.init.declarations[0].id.name;
      const initValue = innerLoopNode.init.declarations[0].init;
      if (initValue && initValue.type === "NumericLiteral") {
        innerStart = initValue.value;
      }
    }

    if (innerLoopNode.test && innerLoopNode.test.type === "BinaryExpression") {
      const testRight = innerLoopNode.test.right;
      if (testRight) {
        innerEndExpr = testRight;

        // Check if inner bound depends on outer variable
        if (testRight.type === "BinaryExpression") {
          // Check if it references outer variable
          if (this.expressionContainsVariable(testRight, outerVar)) {
            innerBoundUsesOuter = true;
          }
        }
      }
    }

    console.log(
      `Nested loops: outer(${outerStart}-${outerEnd}), inner depends on outer: ${innerBoundUsesOuter}`
    );

    // Check for swap operation in inner loop
    let hasSwap = false;
    let swapConditionNode = null;
    let alwaysSwap = false;

    traverse(innerLoopNode.body, {
      IfStatement: (path) => {
        swapConditionNode = path.node.test;

        // Check for swap inside if
        traverse(path.node.consequent, {
          ExpressionStatement: (exprPath) => {
            if (this.isSwapOperation(exprPath.node)) {
              hasSwap = true;
            }
          },
        });
      },
      ExpressionStatement: (path) => {
        // Check for swap outside if (always swap)
        if (!hasSwap && this.isSwapOperation(path.node)) {
          hasSwap = true;
          alwaysSwap = true;
        }
      },
    });

    console.log(`Has swap: ${hasSwap}, Always swap: ${alwaysSwap}`);

    // Execute nested loops
    for (let i = outerStart; i < outerEnd; i++) {
      let innerEnd;

      if (innerBoundUsesOuter) {
        innerEnd = this.currentArray.length - i - 1;
      } else {
        innerEnd = this.currentArray.length - 1;
      }

      for (let j = innerStart; j < innerEnd; j++) {
        // Add compare operation
        this.operations.push({
          type: "compare",
          indices: [j, j + 1],
          values: [this.currentArray[j], this.currentArray[j + 1]],
        });

        // Determine if should swap
        let shouldSwap = false;

        if (alwaysSwap) {
          shouldSwap = true;
        } else if (
          swapConditionNode &&
          swapConditionNode.type === "BinaryExpression"
        ) {
          const op = swapConditionNode.operator;

          if (op === ">") {
            shouldSwap = this.currentArray[j] > this.currentArray[j + 1];
          } else if (op === "<") {
            shouldSwap = this.currentArray[j] < this.currentArray[j + 1];
          } else if (op === ">=") {
            shouldSwap = this.currentArray[j] >= this.currentArray[j + 1];
          } else if (op === "<=") {
            shouldSwap = this.currentArray[j] <= this.currentArray[j + 1];
          }
        }

        if (shouldSwap) {
          this.operations.push({
            type: "swap",
            indices: [j, j + 1],
            values: [this.currentArray[j], this.currentArray[j + 1]],
          });

          [this.currentArray[j], this.currentArray[j + 1]] = [
            this.currentArray[j + 1],
            this.currentArray[j],
          ];
        }
      }

      // Mark as sorted if inner bound reduces
      if (innerBoundUsesOuter && !alwaysSwap) {
        this.operations.push({
          type: "sorted",
          indices: [this.currentArray.length - i - 1],
        });
      }
    }
  }

  executeLoopBody(body, vars) {
    // Execute operations inside loop body
    if (body && body.type === "BlockStatement" && body.body) {
      body.body.forEach((statement) => {
        if (
          statement.type === "ExpressionStatement" &&
          this.isSwapOperation(statement)
        ) {
          const indices = this.getSwapIndices(statement);
          if (indices) {
            this.operations.push({
              type: "swap",
              indices: indices,
              values: [
                this.currentArray[indices[0]],
                this.currentArray[indices[1]],
              ],
            });

            [this.currentArray[indices[0]], this.currentArray[indices[1]]] = [
              this.currentArray[indices[1]],
              this.currentArray[indices[0]],
            ];
          }
        }
      });
    }
  }

  extractDirectSwaps(ast) {
    console.log("Extracting direct swaps");

    traverse(ast, {
      ExpressionStatement: (path) => {
        if (this.isSwapOperation(path.node)) {
          const indices = this.getSwapIndices(path.node);
          if (indices && indices.length === 2) {
            console.log(`Found swap: [${indices[0]}, ${indices[1]}]`);

            this.operations.push({
              type: "swap",
              indices: indices,
              values: [
                this.currentArray[indices[0]],
                this.currentArray[indices[1]],
              ],
            });

            [this.currentArray[indices[0]], this.currentArray[indices[1]]] = [
              this.currentArray[indices[1]],
              this.currentArray[indices[0]],
            ];
          }
        }
      },
    });
  }

  expressionContainsVariable(expr, varName) {
    if (!expr) return false;

    let found = false;

    if (expr.type === "Identifier" && expr.name === varName) {
      return true;
    }

    if (expr.type === "BinaryExpression") {
      found =
        this.expressionContainsVariable(expr.left, varName) ||
        this.expressionContainsVariable(expr.right, varName);
    }

    return found;
  }

  isSwapOperation(node) {
    // Detect: [arr[i], arr[j]] = [arr[j], arr[i]]
    if (
      node.expression &&
      node.expression.type === "AssignmentExpression" &&
      node.expression.left &&
      node.expression.left.type === "ArrayPattern" &&
      node.expression.right &&
      node.expression.right.type === "ArrayExpression"
    ) {
      return true;
    }
    return false;
  }

  getSwapIndices(node) {
    try {
      if (!node.expression || !node.expression.left || !node.expression.right) {
        return null;
      }

      const left = node.expression.left.elements;
      const right = node.expression.right.elements;

      if (left && right && left.length === 2 && right.length === 2) {
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

  getIndexFromArrayAccess(node) {
    if (!node || !node.property) return null;

    if (node.property.type === "NumericLiteral") {
      return node.property.value;
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
