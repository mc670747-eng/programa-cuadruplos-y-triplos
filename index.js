"use strict";

// Lee la expresión y la separa en números, variables y operadores.
class ExpressionParser {
  constructor(source) {
    this.tokens = this.tokenize(source);
    this.position = 0;
  }

  tokenize(source) {
    const tokens = [];
    const pattern = /\s+|(?:\d+(?:\.\d*)?|\.\d+)|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/^=]/gy;
    let position = 0;

    while (position < source.length) {
      pattern.lastIndex = position;
      const match = pattern.exec(source);
      if (!match) {
        throw new SyntaxError(`Carácter no válido: '${source[position]}'`);
      }
      position = pattern.lastIndex;
      if (!/^\s+$/.test(match[0])) {
        tokens.push(match[0]);
      }
    }

    if (tokens.length === 0) throw new SyntaxError("Escribe una expresión para continuar.");
    return tokens;
  }

  current() {
    if (this.position < this.tokens.length) {
      return this.tokens[this.position];
    }
    return null;
  }

  advance() {
    const token = this.current();
    this.position++;
    return token;
  }

  parse() {
    let assignment = null;
    const firstToken = this.current();
    if (firstToken !== null && /^[A-Za-z_][A-Za-z0-9_]*$/.test(firstToken) && this.tokens[1] === "=") {
      assignment = this.advance();
      this.advance();
      if (this.current() === null) throw new SyntaxError("Escribe una expresión después de '='.");
    }

    const expression = this.parseAddition();
    if (this.current() !== null) {
      throw new SyntaxError(`Token inesperado: '${this.current()}'.`);
    }
    return { assignment, expression };
  }

  parseAddition() {
    // Primero se analiza una multiplicación y después las sumas o restas.
    let node = this.parseMultiplication();
    while (this.current() === "+" || this.current() === "-") {
      const operator = this.advance();
      node = { type: "binary", operator, left: node, right: this.parseMultiplication() };
    }
    return node;
  }

  parseMultiplication() {
    // La multiplicación y división tienen prioridad sobre suma y resta.
    let node = this.parseUnary();
    while (this.current() === "*" || this.current() === "/") {
      const operator = this.advance();
      node = { type: "binary", operator, left: node, right: this.parseUnary() };
    }
    return node;
  }

  parseUnary() {
    // El signo positivo o negativo puede aparecer antes de un número o grupo.
    if (this.current() === "+" || this.current() === "-") {
      const operator = this.advance();
      return { type: "unary", operator, operand: this.parseUnary() };
    }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePrimary();
    if (this.current() === "^") {
      this.advance();
      return { type: "binary", operator: "^", left: base, right: this.parseUnary() };
    }
    return base;
  }

  parsePrimary() {
    // Un elemento básico puede ser un número, una variable o una expresión entre paréntesis.
    const token = this.advance();
    if (token === null) throw new SyntaxError("La expresión terminó inesperadamente.");

    if (token === "(") {
      const node = this.parseAddition();
      if (this.advance() !== ")") throw new SyntaxError("Falta cerrar un paréntesis.");
      return node;
    }
    if (token === ")") throw new SyntaxError("Hay un paréntesis de cierre sin pareja.");
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      return { type: "number", value: Number(token), raw: token };
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return { type: "variable", name: token };
    throw new SyntaxError(`Se esperaba un número, una variable o '(', no '${token}'.`);
  }
}

function buildIntermediateCode(ast, assignment) {
  // Recorre el árbol de la expresión y crea las dos tablas.
  const quadruples = [];
  const triples = [];
  let temporaryCount = 0;

  function compile(node) {
    // Los números y las variables se usan directamente como argumentos.
    if (node.type === "number") return { quadrupleRef: node.raw, tripleRef: node.raw };
    if (node.type === "variable") return { quadrupleRef: node.name, tripleRef: node.name };

    // Primero procesa los elementos internos para respetar paréntesis y prioridad.
    if (node.type === "unary") {
      const operand = compile(node.operand);
      const operator = node.operator === "-" ? "neg" : "pos";
      const temporary = `t${++temporaryCount}`;
      const tripleIndex = triples.length;
      quadruples.push([operator, operand.quadrupleRef, "-", temporary]);
      triples.push([operator, operand.tripleRef, "-"]);
      return { quadrupleRef: temporary, tripleRef: `(${tripleIndex})` };
    }

    const left = compile(node.left);
    const right = compile(node.right);
    const temporary = `t${++temporaryCount}`;
    const tripleIndex = triples.length;
    quadruples.push([node.operator, left.quadrupleRef, right.quadrupleRef, temporary]);
    triples.push([node.operator, left.tripleRef, right.tripleRef]);
    return { quadrupleRef: temporary, tripleRef: `(${tripleIndex})` };
  }

  const result = compile(ast);
  if (assignment) {
    quadruples.push(["=", result.quadrupleRef, "-", assignment]);
    triples.push(["=", assignment, result.tripleRef]);
  }
  return { quadruples, triples };
}

// Busca las variables que aparecen en la expresión.
function findVariables(ast, variables) {
  if (variables === undefined) {
    variables = [];
  }

  if (ast.type === "variable" && variables.indexOf(ast.name) === -1) {
    variables.push(ast.name);
  } else if (ast.type === "unary") {
    findVariables(ast.operand, variables);
  } else if (ast.type === "binary") {
    findVariables(ast.left, variables);
    findVariables(ast.right, variables);
  }

  return variables;
}

// Calcula el resultado usando los valores ingresados para las variables.
function evaluate(ast, variableValues) {
  if (ast.type === "number") return ast.value;
  if (ast.type === "variable") {
    if (Object.prototype.hasOwnProperty.call(variableValues, ast.name)) {
      return variableValues[ast.name];
    }
    return null;
  }
  if (ast.type === "unary") {
    const value = evaluate(ast.operand, variableValues);
    if (value === null) return null;
    return ast.operator === "-" ? -value : value;
  }

  const left = evaluate(ast.left, variableValues);
  const right = evaluate(ast.right, variableValues);
  if (left === null || right === null) return null;

  let result;
  switch (ast.operator) {
    case "+":
      result = left + right;
      break;
    case "-":
      result = left - right;
      break;
    case "*":
      result = left * right;
      break;
    case "/":
      result = left / right;
      break;
    case "^":
      result = left ** right;
      break;
    default:
      throw new Error("Operador no reconocido.");
  }
  if (!Number.isFinite(result)) {
    throw new RangeError("El resultado no es un número finito. Revisa la división entre cero o la magnitud de la operación.");
  }
  return result;
}

function formatExpression(ast) {
  if (ast.type === "number") return ast.raw;
  if (ast.type === "variable") return ast.name;
  if (ast.type === "unary") return `(${ast.operator}${formatExpression(ast.operand)})`;
  return `(${formatExpression(ast.left)} ${ast.operator} ${formatExpression(ast.right)})`;
}

function formatNumber(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(12)));
}

function renderTable(container, headers, rows) {
  const table = document.createElement("table");
  table.className = "table table-sm align-middle mb-0";
  const thead = document.createElement("thead");
  thead.className = "table-light";
  const headerRow = document.createElement("tr");

  const allHeaders = ["#"].concat(headers);
  for (let index = 0; index < allHeaders.length; index++) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = allHeaders[index];
    headerRow.appendChild(cell);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = headers.length + 1;
    cell.textContent = "Esta expresión no necesita operaciones intermedias.";
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    for (let index = 0; index < rows.length; index++) {
      const values = rows[index];
      const row = document.createElement("tr");
      const allValues = [index].concat(values);
      for (let column = 0; column < allValues.length; column++) {
        const cell = document.createElement("td");
        cell.textContent = String(allValues[column]);
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
  }
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

const form = document.querySelector("#expression-form");
const expressionInput = document.querySelector("#expr");
const errorMessage = document.querySelector("#expression-error");
const resultContent = document.querySelector("#result-content");
const results = document.querySelector("#results");
const variableValuesSection = document.querySelector("#variable-values");
const variableInputs = document.querySelector("#variable-inputs");
let variableValues = {};

// Crea un campo numérico para cada variable distinta.
function showVariableInputs(names) {
  const existingInputs = variableInputs.querySelectorAll("input");
  for (let index = 0; index < existingInputs.length; index++) {
    const name = existingInputs[index].dataset.variable;
    variableValues[name] = existingInputs[index].value;
  }

  variableInputs.innerHTML = "";
  for (let index = 0; index < names.length; index++) {
    const name = names[index];
    const column = document.createElement("div");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const inputId = "variable-value-" + name;

    column.className = "col";
    label.className = "form-label small mb-1";
    label.htmlFor = inputId;
    label.textContent = name;
    input.type = "number";
    input.step = "any";
    input.id = inputId;
    input.className = "form-control form-control-sm";
    input.dataset.variable = name;
    input.value = variableValues[name] || "";

    column.appendChild(label);
    column.appendChild(input);
    variableInputs.appendChild(column);
  }
  variableValuesSection.hidden = names.length === 0;
}

// Lee los campos y confirma que todas las variables tengan un número válido.
function readVariableValues(names) {
  const values = {};
  for (let index = 0; index < names.length; index++) {
    const input = variableInputs.querySelector(`[data-variable="${names[index]}"]`);
    if (input.value.trim() === "" || !Number.isFinite(Number(input.value))) {
      return null;
    }
    values[names[index]] = Number(input.value);
  }
  return values;
}

function calculate() {
  errorMessage.hidden = true;
  errorMessage.textContent = "";

  try {
    const parser = new ExpressionParser(expressionInput.value.trim());
    const parsedExpression = parser.parse();
    const assignment = parsedExpression.assignment;
    const expression = parsedExpression.expression;
    const variableNames = findVariables(expression);

    if (variableNames.length > 0) {
      showVariableInputs(variableNames);
      const enteredValues = readVariableValues(variableNames);
      if (enteredValues === null) {
        resultContent.hidden = true;
        errorMessage.textContent = "Ingresa un valor numérico para cada variable y vuelve a calcular.";
        errorMessage.hidden = false;
        variableInputs.querySelector("input").focus();
        return;
      }
      variableValues = enteredValues;
    } else {
      showVariableInputs([]);
      variableValues = {};
    }

    const intermediateCode = buildIntermediateCode(expression, assignment);
    const quadruples = intermediateCode.quadruples;
    const triples = intermediateCode.triples;
    const value = evaluate(expression, variableValues);
    const answerCard = document.querySelector("#answer-card");
    const answerLabel = document.querySelector("#answer-label");
    const answerValue = document.querySelector("#answer-value");

    document.querySelector("#result-expression").textContent = assignment
      ? `${assignment} = ${formatExpression(expression)}`
      : formatExpression(expression);
    answerCard.classList.remove("answer-symbolic");
    answerLabel.textContent = "RESULTADO NUMÉRICO";
    answerValue.textContent = (assignment ? assignment + " = " : "") + formatNumber(value);

    renderTable(document.querySelector("#quad-table"), ["Operador", "Arg. 1", "Arg. 2", "Resultado"], quadruples);
    renderTable(document.querySelector("#triple-table"), ["Operador", "Arg. 1", "Arg. 2"], triples);
    resultContent.hidden = false;
    results.setAttribute("aria-busy", "false");
  } catch (error) {
    resultContent.hidden = true;
    results.setAttribute("aria-busy", "false");
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
    expressionInput.focus();
  }
}

form.addEventListener("submit", function (event) {
  event.preventDefault();
  calculate();
});

document.querySelector("#clear-button").addEventListener("click", function () {
  expressionInput.value = "";
  errorMessage.hidden = true;
  resultContent.hidden = true;
  document.querySelector("#result-expression").textContent = "";
  variableValues = {};
  variableInputs.innerHTML = "";
  variableValuesSection.hidden = true;
  expressionInput.focus();
});
