let deckElement = document.querySelector(".deck");
const baseUrl = "https://api.scryfall.com/cards/search?q=";
const cardPath = "name=";
const tokenPath = "t:token%20name=";

const getCardUrl = (cardName, set) => `${baseUrl}${cardPath}${encodeURI(cardName)}${(!!set ? `%20set:${set}` : '')}`;
const getTokenUrl = (cardName, set) => `${baseUrl}${tokenPath}${encodeURI(cardName)}${(!!set ? `%20set:${(set.length === 3 ? 't' : '')}${set}` : '')}`;

function extracts(input, from, to) {
  const start = input.indexOf(from) + from.length;
  const distance = input.lastIndexOf(to) - start;
  return input.substr(start, distance);
}

function indexOfNaN(input) {
  let i = 0;
  for (; input[i] >= "0" && input[i] <= "9"; i++);
  return i;
}

function cleanStars(input) {
  return input.replace(/ \*([^*]+)\*/g, "");
}

function parseContext(contextWithStars) {
  const context = cleanStars(contextWithStars); // todo: No foil, alter, language nor condition
  const number = context.substr(0, indexOfNaN(context));
  const quantity = number === "" ? 1 : parseInt(number);
  var start = number === "" ? 0 : context.indexOf(" ") + 1;
  var distance =
    (context.includes(" (") ? context.indexOf(" (") : context.length) - start;
  const name = context.substr(start, distance);
  const set = extracts(context, "(", ")");

  return {
    name: name,
    quantity: quantity,
    set: set,
  };
}

function getNextEdition(editions) {
  let i = 0;
  for (; i < editions.length && editions[i].image_url.endsWith("/0.jpg"); i++);
  return editions[i];
}

function selectRandomItems(items) {
  return items[Math.floor(Math.random() * items.length)];
}

// it could be nice to divide to get more of them
function selectIllustration(illustrations) {
  return selectRandomItems(illustrations).image_url;
}

function buildCardDataset(cardData) {
  return {
      custom: false,
      name: cardData.name,
      cost: cardData.mana_cost,
      loyalty: cardData.loyalty,
      power: cardData.power,
      toughness: cardData.toughness,
      source: cardData.image_uris.large
    };
}

function getCardImageUrls(data, name) {
  // todo: should we handle name case?
  const cardData = data.data.filter((x) => x.name === name)[0];
  if (cardData.card_faces === undefined) return [buildCardDataset(cardData)];
  return [
    buildCardDataset(cardData.card_faces[0]),
    buildCardDataset(cardData.card_faces[1])
  ];
}

function getTokenImageUrls(data, name) {
  const cardData = data.data.filter((x) => x.name === name)[0];
  if (cardData.name === undefined) return [];
  if (cardData.name === name && cardData.layout === "token") return [ cardData.image_uris.large ];
  if (cardData.layout !== "double_faced_token") return []; 
  const face = cardData.card_faces.find(f => f.name === name);
  return face === undefined ? [] : [ face.image_uris.large ];
}

function appendCards(sources, quantity) {
  const proxyurl = "https://cors-anywhere.herokuapp.com/";
  sources.forEach((source) => {
    for (let i = 0; i < quantity; i++) {
      let img = document.createElement("img");
      const src = proxyurl + source.source;
      img.crossOrigin = "anonymous";
      img.setAttribute("src", src);
      img.classList.add("noGutter");
      img.classList.add("normalSize");
      img.dataset.src = src;
      img.dataset.custom = source.custom;
      if (!source.custom) {
          img.dataset.name = source.name;
          img.dataset.cost = source.mana_cost;
          img.dataset.loyalty = source.loyalty;
          img.dataset.power = source.power;
          img.dataset.toughness = source.toughness;
      }
      deckElement.appendChild(img);
    }
  });
}

function clean() {
  document.querySelector("main").innerHTML = "";
}

function isUrl(str) {
  var pattern = new RegExp(
    "^(https?:\\/\\/)?" + // protocol
      "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // domain name
      "((\\d{1,3}\\.){3}\\d{1,3}))" + // OR ip (v4) address
      "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // port and path
      "(\\?[;&a-z\\d%_.~+=-]*)?" + // query string
      "(\\#[-a-z\\d_]*)?$",
    "i"
  ); // fragment locator
  return !!pattern.test(str);
}

function fill(value, isToken=false) {
  value.split("\n").forEach((context) => {
    const card = parseContext(context);
    if (isUrl(card.name)) {
      appendCards([{source: card.name, custom: true}], card.quantity);
      return;
    }
    const url = isToken ? getTokenUrl(card.name, card.set) : getCardUrl(card.name, card.set);
    fetch(url)
      .then((response) => response.json())
      .then((data) =>
        appendCards(
          isToken
            ? getTokenImageUrls(data, card.name)
            : getCardImageUrls(data, card.name, card.edition),
          card.quantity)
      )
      .catch((e) => console.log(`Booo:\n ${e}`));
  });
}

const a4Height = 297;
const a4Width = 210;

const { jsPDF } = window.jspdf;

const range = (n) => [...Array(n).keys()];

function getColumns(width, cardWidth) {
  const minimalMargin = 10;
  const pageWidth = width - minimalMargin * 2;
  const columns = Math.floor(pageWidth / cardWidth);
  return columns;
}

function getRows(height, cardHeight) {
  const minimalMargin = 10;
  const pageHeight = height - minimalMargin * 2;
  const rows = Math.floor(pageHeight / cardHeight);
  return rows;
}

const getCardPositions = (
  deckSize,
  cardWidth,
  cardHeight,
  columns,
  rows,
  gutter
) => {
  const cells = columns * rows;
  return range(deckSize).map((i) => {
    const local = i % cells;
    return {
      x: cardWidth * (local % columns) + gutter * (local % columns),
      y:
        cardHeight * Math.floor(local / rows) +
        gutter * Math.floor(local / rows),
      isLast: local === cells - 1,
    };
  });
};

const buildPdf = (
  base64Images,
  cardPositions,
  cardWidth,
  cardHeight,
  columns,
  rows,
  pageWidth,
  pageHeight,
  gutter
) => {
  let doc = new jsPDF();
  const marginLeft =
    (pageWidth - cardWidth * columns - gutter * (columns - 1)) / 2;
  const marginTop = (pageHeight - cardHeight * rows - gutter * (rows - 1)) / 2;
  cardPositions.forEach((position, i) => {
    const x = marginLeft + position.x;
    const y = marginTop + position.y;

    doc.addImage(base64Images[i], "JPEG", x, y, cardWidth, cardHeight);

    if (position.isLast && i < cardPositions.length - 1) {
      doc.addPage();
    }
  });
  return doc;
};

function saveAspdf(doc, deckSize, cardName) {
  const name = `diab-${deckSize}_${cardName.replace(" ", "_")}.pdf`;
  doc.save(name);
}

function getGutter(gutterClass) {
  if (gutterClass === "smallGutter") {
    return 1;
  }
  if (gutterClass === "tinyGutter") {
    return 0.5;
  }
  return 0;
}

function getCardSize(sizeClass) {
  if (sizeClass === "tinySize") {
    return {
      width: 38,
      height: 53,
      name: "38x53",
    };
  }
  if (sizeClass === "smallSize") {
    return {
      width: 56,
      height: 78,
      name: "56x78",
    };
  }
  return {
    width: 63,
    height: 88,
    name: "Std Card USA Game",
  };
}

function print() {
  const imgs = document.querySelectorAll(".deck img");
  const deckSize = imgs.length;

  const sizeClass = [...imgs[0].classList].filter((x) => x.includes("Size"))[0];
  const card = getCardSize(sizeClass);
  const columns = getColumns(a4Width, card.width);
  const rows = getRows(a4Height, card.height);
  const gutterClass = [...imgs[0].classList].filter((x) =>
    x.includes("Gutter")
  )[0];
  const gutter = getGutter(gutterClass);

  const base64Images = [...imgs].map((img) =>
    getBase64Image(img, card.width, card.height)
  );
  const cardPositions = getCardPositions(
    deckSize,
    card.width,
    card.height,
    columns,
    rows,
    gutter
  );
  const doc = buildPdf(
    base64Images,
    cardPositions,
    card.width,
    card.height,
    columns,
    rows,
    a4Width,
    a4Height,
    gutter
  );
  saveAspdf(doc, deckSize, card.name);
}

function getBase64Image(img, width, height) {
  const classes = img.className;
  img.className = "";
  var canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, img.width, img.height);
  var dataURL = canvas.toDataURL("image/jpg");
  img.className = classes;
  return dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
}

function renderDeck() {
  const value = document.querySelector(".cards").value.trim();
  const extraTokens = document.querySelector("#extra_tokens").value.trim();
  if (value === "" && extraTokens === "") return;

  clean();
  fill(value);
  fill(extraTokens, true);
}

document.querySelector(".print").onclick = 
  function () {
    const value = document.querySelector(".cards").value.trim();
    if (value === "") return;
    print();
  };

document.querySelector(".display").onclick = renderDeck;

document.querySelector(".gutter").onchange = function (e) {
  let imgs = document.querySelectorAll(".deck img");
  if (imgs.length == 0) return;
  const previous = e.target.dataset.gutter ?? "noGutter";
  imgs.forEach((img) => {
    img.classList.remove(previous);
    img.classList.add(e.target.value);
  });
  e.target.dataset.gutter = e.target.value;
};

document.querySelector(".size").onchange = function (e) {
  let imgs = document.querySelectorAll(".deck img");
  if (imgs.length == 0) return;
  const previous = e.target.dataset.size ?? "normalSize";
  imgs.forEach((img) => {
    img.classList.remove(previous);
    img.classList.add(e.target.value);
  });
  e.target.dataset.size = e.target.value;
};
  
function drawTitle(ctx, lines) {
  ctx.font = '38px sans-serif';
  var x = 30;
  var y = 100;
  var lineHeight = 40;
  lines.forEach((line, i) => 
    ctx.fillText(line, x, y + i * lineHeight));
}

function drawCmc(ctx, canvaswidth, cmc) {
  ctx.font = '26px mono';
  var x = 30;
  var y = 30;
  ctx.fillText(
    cmc.toUpperCase(),
    canvaswidth - ctx.measureText(cmc).width - x,
    y);
}

function drawBottomRight(ctx, canvasWidth, canvasHeight, value) { 
  ctx.font = '26px mono';
  var x = 30;
  var y = 30;
  ctx.fillText(
    value,
    canvasWidth - ctx.measureText(value).width - x / 2,
    canvasHeight - y / 2);
}

function createCardAsText(cardName, cardCost, bottomValue) {
var canvas = document.createElement('canvas');
var ctx = canvas.getContext('2d');
canvas.width = 63*4;
canvas.height = 88*4;
canvas.style.width = "63mm";
canvas.style.height = "88mm";
ctx.clearRect(0, 0, canvas.width,canvas.height);
ctx.fillStyle = 'rgb(255,255,255)';
ctx.fillRect(0,0,canvas.width,canvas.height);
ctx.fillStyle = 'rgb(0,0,0)';

const lines = cardName.split(' ');
drawTitle(ctx, lines);
drawCmc(ctx, canvas.width, cardCost);
drawBottomRight(ctx, canvas.width, canvas.height, bottomValue);
  return canvas.toDataURL('image/jpeg', 1.0);
}

document.querySelector(".cardAs").onchange = function (e) {
  let imgs = document.querySelectorAll(".deck img");
  if (imgs.length == 0) return;
  [...imgs]
    .filter(img => !img.dataset.custom)
    .forEach((img) => {
      img.src = e.target.value === "image"
        ? img.dataset.src
        : createCardAsText(img.dataset.name, img.dataset.cost, img.dataset.loyalty ?? (img.dataset.power.length && img.dataset.toughness ? `${img.dataset.power} / ${img.dataset.toughness}` : ""));
    });
};

// const context = document.querySelector('.card').textContent;
// const card = parseContext(context);
// const url = baseUrl + encodeURI(card.name);

const locationHref = new URL(window.location.href);
if (locationHref.search) {
  const searchParams = new URLSearchParams(locationHref.search);
  document.getElementById("cards").value = searchParams.get("cards");
  document.getElementById("extra_tokens").value = searchParams.get("tokens");
}
renderDeck();
