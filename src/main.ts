import * as THREE from 'three'
import './styles/main.css'
import { GENERATIONS, POKEMON_COUNT, pokemonName, pokemonSprite } from './game/pokemon'

type Card = { id: number; key: string; matched: boolean; revealed: boolean }
type Difficulty = { pairs: number; cols: number; label: string }

const difficulties: Difficulty[] = [
  { pairs: 6, cols: 4, label: 'Éclaireur' },
  { pairs: 8, cols: 4, label: 'Dresseur' },
  { pairs: 10, cols: 5, label: 'Champion' },
  { pairs: 15, cols: 6, label: 'Maître' },
]

const root = document.querySelector<HTMLDivElement>('#ui')!
const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const savedBest = Number(localStorage.getItem('pokematch.best') ?? 0)
let selectedGeneration = 0
let cards: Card[] = []
let first: Card | null = null
let locked = false
let moves = 0
let score = 0
let matched = 0
let startedAt = 0
let streak = Number(localStorage.getItem('pokematch.streak') ?? 0)
let currentDifficulty = 0
let roundToken = 0

root.innerHTML = `
  <main class="app-shell">
    <section class="hero" data-screen="home">
      <div class="hero-grid"></div>
      <div class="brand-mark"><span class="brand-ball"><i></i></span><span>POKÉ<span class="brand-accent">MATCH</span></span></div>
      <div class="hero-copy">
        <p class="eyebrow">ARÈNE DE MÉMOIRE · 1 025 ESPÈCES</p>
        <h1>Attrape-les<br><em>toutes.</em></h1>
        <p class="hero-lede">Retourne les cartes, retrouve les paires et construis ta série de victoires dans le Pokédex ultime.</p>
        <div class="hero-controls">
          <label for="generation">Collection</label>
          <select id="generation"><option value="0">Toutes les générations</option>${GENERATIONS.map((g, i) => `<option value="${i + 1}">${g.label} · ${g.from}–${g.to}</option>`).join('')}</select>
          <button class="primary" id="start">Lancer une manche <span>↗</span></button>
        </div>
      </div>
      <div class="hero-pokeball" aria-hidden="true"><div class="ball-line"></div><div class="ball-button"></div></div>
      <div class="hero-foot"><span><b id="best-home">${savedBest.toLocaleString('fr-FR')}</b> meilleur score</span><span><b id="streak-home">${streak}</b> série actuelle</span><span class="catalogue-count">Catalogue complet · génération progressive</span></div>
    </section>

    <section class="game-screen is-hidden" data-screen="game">
      <header class="game-header">
        <div class="brand-mark compact"><span class="brand-ball"><i></i></span><span>POKÉ<span class="brand-accent">MATCH</span></span></div>
        <div class="round-meta"><span id="round-label">MANCHE 01</span><strong id="difficulty-label">Éclaireur</strong></div>
        <button class="ghost" id="quit">Quitter</button>
      </header>
      <div class="game-layout">
        <aside class="score-rail">
          <div class="stat"><span>Score</span><strong id="score">0</strong></div>
          <div class="stat"><span>Coups</span><strong id="moves">0</strong></div>
          <div class="stat"><span>Temps</span><strong id="time">00:00</strong></div>
          <div class="stat"><span>Série</span><strong id="streak">${streak}</strong></div>
          <div class="rail-note">Chaque paire trouvée augmente ton multiplicateur.</div>
        </aside>
        <div class="board-wrap">
          <div class="board-top"><div><p class="eyebrow">POKÉDEX / COLLECTION ${selectedGeneration ? GENERATIONS[selectedGeneration - 1].label.toUpperCase() : 'COMPLÈTE'}</p><h2>Retrouve les paires</h2></div><button class="small-action" id="shuffle">Mélanger ↻</button></div>
          <div id="board" class="board" aria-live="polite"></div>
          <p class="board-hint">Deux cartes identiques = une paire. Fais travailler ta mémoire.</p>
        </div>
      </div>
    </section>

    <section class="result-modal is-hidden" id="result" role="dialog" aria-modal="true">
      <div class="result-card"><div class="result-spark">✦</div><p class="eyebrow">MANCHE TERMINÉE</p><h2 id="result-title">Excellent travail.</h2><p id="result-copy"></p><div class="result-stats"><div><span>Score</span><b id="result-score">0</b></div><div><span>Coups</span><b id="result-moves">0</b></div><div><span>Temps</span><b id="result-time">00:00</b></div></div><div class="result-actions"><button class="primary" id="next">Manche suivante <span>↗</span></button><button class="ghost" id="again">Rejouer cette manche</button><button class="ghost" id="home">Retour au Pokédex</button></div></div>
    </section>
  </main>`

const home = document.querySelector<HTMLElement>('[data-screen="home"]')!
const gameScreen = document.querySelector<HTMLElement>('[data-screen="game"]')!
const result = document.querySelector<HTMLElement>('#result')!
const board = document.querySelector<HTMLDivElement>('#board')!
const generationSelect = document.querySelector<HTMLSelectElement>('#generation')!

function shuffle<T>(items: T[]): T[] { return [...items].sort(() => Math.random() - 0.5) }
function difficulty(): Difficulty { return difficulties[Math.min(currentDifficulty, difficulties.length - 1)] }
function poolBounds(): [number, number] { const g = selectedGeneration ? GENERATIONS[selectedGeneration - 1] : { from: 1, to: POKEMON_COUNT }; return [g.from, g.to] }
function pickCards(): Card[] {
  const [from, to] = poolBounds(); const chosen: number[] = []
  while (chosen.length < difficulty().pairs) { const id = from + Math.floor(Math.random() * (to - from + 1)); if (!chosen.includes(id)) chosen.push(id) }
  return shuffle(chosen.flatMap(id => [{ id, key: `${id}-a`, matched: false, revealed: false }, { id, key: `${id}-b`, matched: false, revealed: false }]))
}
function formatTime(seconds: number): string { const s = Math.floor(seconds); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
function updateStats(): void { document.querySelector('#score')!.textContent = score.toLocaleString('fr-FR'); document.querySelector('#moves')!.textContent = String(moves); document.querySelector('#streak')!.textContent = String(streak); document.querySelector('#time')!.textContent = formatTime((Date.now() - startedAt) / 1000) }
function cardMarkup(card: Card, index: number): string { const visible = card.revealed || card.matched; return `<button class="memory-card ${visible ? 'is-visible' : ''} ${card.matched ? 'is-matched' : ''}" data-index="${index}" aria-label="Carte ${index + 1}"><span class="card-face card-back"><i>?</i><small>POKÉDEX</small></span><span class="card-face card-front"><span class="number">#${String(card.id).padStart(4, '0')}</span><img src="${pokemonSprite(card.id)}" alt="${pokemonName(card.id)}" loading="lazy" /><span class="image-fallback" aria-hidden="true">✦</span><b>${pokemonName(card.id)}</b></span></button>` }
function renderBoard(): void {
  board.style.setProperty('--cols', String(difficulty().cols)); board.innerHTML = cards.map(cardMarkup).join('')
  board.querySelectorAll<HTMLImageElement>('.card-front img').forEach(image => image.addEventListener('error', () => { image.hidden = true; image.nextElementSibling?.classList.add('is-visible') }, { once: true }))
  board.querySelectorAll<HTMLButtonElement>('.memory-card').forEach(button => button.addEventListener('click', () => flip(Number(button.dataset.index))))
}
function startRound(next = false): void {
  if (next) currentDifficulty = Math.min(currentDifficulty + 1, difficulties.length - 1)
  roundToken += 1; first = null; locked = false; moves = 0; score = 0; matched = 0; startedAt = Date.now(); cards = pickCards();
  home.classList.add('is-hidden'); result.classList.add('is-hidden'); gameScreen.classList.remove('is-hidden');
  document.querySelector('#difficulty-label')!.textContent = difficulty().label; document.querySelector('#round-label')!.textContent = `MANCHE ${String(currentDifficulty + 1).padStart(2, '0')}`
  document.querySelector('.board-top .eyebrow')!.textContent = `POKÉDEX / COLLECTION ${selectedGeneration ? GENERATIONS[selectedGeneration - 1].label.toUpperCase() : 'COMPLÈTE'}`
  renderBoard(); updateStats()
}
function flip(index: number): void {
  if (locked || cards[index].matched || cards[index].revealed) return
  cards[index].revealed = true; renderBoard()
  if (!first) { first = cards[index]; return }
  moves += 1; const second = cards[index]; const same = first.id === second.id
  if (same) { first.matched = true; second.matched = true; matched += 1; score += Math.max(100, 420 - moves * 12); first = null; renderBoard(); updateStats(); if (matched === difficulty().pairs) finishRound(); return }
  locked = true; const token = roundToken; const firstRef = first; first = null; updateStats(); window.setTimeout(() => { if (token !== roundToken) return; firstRef!.revealed = false; second.revealed = false; locked = false; renderBoard() }, 720)
}
function finishRound(): void { streak += 1; localStorage.setItem('pokematch.streak', String(streak)); const elapsed = (Date.now() - startedAt) / 1000; score += Math.max(0, Math.round(900 - elapsed * 8)); if (score > Number(localStorage.getItem('pokematch.best') ?? 0)) localStorage.setItem('pokematch.best', String(score)); document.querySelector('#result-score')!.textContent = score.toLocaleString('fr-FR'); document.querySelector('#result-moves')!.textContent = String(moves); document.querySelector('#result-time')!.textContent = formatTime(elapsed); document.querySelector('#result-title')!.textContent = score > savedBest ? 'Nouveau record.' : 'Paires capturées.'; document.querySelector('#result-copy')!.textContent = `${streak} manche${streak > 1 ? 's' : ''} gagnée${streak > 1 ? 's' : ''} d’affilée. Le Pokédex est fier de toi.`; result.classList.remove('is-hidden') }

generationSelect.addEventListener('change', () => { selectedGeneration = Number(generationSelect.value); document.querySelector('#best-home')!.textContent = Number(localStorage.getItem('pokematch.best') ?? 0).toLocaleString('fr-FR') })
document.querySelector('#start')!.addEventListener('click', () => startRound())
document.querySelector('#shuffle')!.addEventListener('click', () => { cards = pickCards(); first = null; locked = false; renderBoard() })
document.querySelector('#quit')!.addEventListener('click', () => { roundToken += 1; gameScreen.classList.add('is-hidden'); home.classList.remove('is-hidden') })
document.querySelector('#again')!.addEventListener('click', () => startRound())
document.querySelector('#next')!.addEventListener('click', () => startRound(true))
document.querySelector('#home')!.addEventListener('click', () => { result.classList.add('is-hidden'); gameScreen.classList.add('is-hidden'); home.classList.remove('is-hidden') })
window.setInterval(() => { if (!gameScreen.classList.contains('is-hidden') && result.classList.contains('is-hidden')) updateStats() }, 250)

const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x10152f, 8, 26)
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 12)
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x10152f, 1)
scene.add(new THREE.AmbientLight(0x7b86c8, 2.1)); const key = new THREE.PointLight(0xffd34d, 55, 20); key.position.set(4, 4, 8); scene.add(key)
const stars = new THREE.Group(); for (let i = 0; i < 180; i += 1) { const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.random() * 0.025 + 0.008, 6, 6), new THREE.MeshBasicMaterial({ color: i % 5 === 0 ? 0xffd34d : 0x7180bf, transparent: true, opacity: Math.random() * 0.7 + 0.2 })); dot.position.set((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10); stars.add(dot) } scene.add(stars)
function animate(): void { stars.rotation.y += 0.00035; stars.rotation.x = Math.sin(performance.now() * 0.00012) * 0.04; renderer.render(scene, camera); requestAnimationFrame(animate) } animate()
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight) })
;(window as unknown as { __game: unknown }).__game = {
  startRound,
  getState: () => ({ moves, score, matched, total: difficulty().pairs }),
  getCards: () => cards.map(card => ({ id: card.id, matched: card.matched, revealed: card.revealed })),
}
