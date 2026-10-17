const STAGE_W = 1440;
const STAGE_H = 1024;
const stage = document.getElementById('stage');

// ステージ全体が画面に収まるように拡縮する
function fitStage() {
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  stage.style.setProperty('--scale', scale);
}
window.addEventListener('resize', fitStage);
fitStage();

// シーン遷移
const scenes = [...document.querySelectorAll('.scene')];
let current = 0;

function goTo(index) {
  if (index < 0 || index >= scenes.length) return;
  scenes[current].classList.remove('is-active');
  current = index;
  scenes[current].classList.add('is-active');
}

document.addEventListener('click', (e) => {
  if (e.target.closest('.next')) goTo(current + 1);
});
