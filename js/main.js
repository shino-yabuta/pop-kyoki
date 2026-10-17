// シーン遷移（URL の #番号 と連動させる。例：#2 でシーン2を表示）
// 1つの画面に複数のシーンを持たせられる（例：data-scene="2 3" は、2 と 3 を同じ画面内で切り替える）
const steps = [...document.querySelectorAll('.scene')].flatMap((el) =>
  el.dataset.scene.split(' ').map((n) => ({ n, el }))
);
let current = 0;
let ctx = null;
let leaving = null; // フェードで消えていく途中の画面

function show(index) {
  const prev = steps[current];
  const next = steps[index];
  // BACK などで前のシーンに戻るとき（そのシーンは最後の状態から表示する）
  const isBack = index < current;
  current = index;

  // 同じ画面内での移動は、アニメーションを途切れさせずにその画面の step() に任せる
  if (ctx && ctx.step && prev.el === next.el) {
    ctx.step(next.n);
    return;
  }

  // 前の切り替えのフェードが終わっていなければ、すぐに終わらせる
  if (leaving) leaving.finish();

  const animate = sceneAnimations[next.el.dataset.scene.split(' ')[0]];
  const startNext = () => {
    next.el.classList.add('is-active');
    ctx = animate ? gsap.context((self) => animate(next.el, self, next.n, isBack), next.el) : null;
  };

  // 最初の表示はそのまま出す
  if (prev.el === next.el) {
    if (ctx) ctx.revert();
    startNext();
    return;
  }

  // 画面の切り替え：前の画面を下に残したまま、次の画面をフェードインで重ねる
  const prevCtx = ctx;
  prev.el.classList.add('is-leaving');
  startNext();
  let fade = null;
  leaving = {
    finish() {
      if (fade) fade.kill();
      gsap.set(next.el, { clearProps: 'opacity' });
      // 前の画面のアニメーションを止めて元に戻し、非表示にする
      if (prevCtx) prevCtx.revert();
      prev.el.classList.remove('is-active', 'is-leaving');
      leaving = null;
    },
  };

  // data-cut-in のある画面へ進むときは、フェードせず一瞬で切り替える（例：シーン7の暗転）
  if (next.el.hasAttribute('data-cut-in') && !isBack) {
    leaving.finish();
    return;
  }
  fade = gsap.fromTo(next.el, { opacity: 0 }, {
    opacity: 1,
    duration: 0.6,
    ease: 'power1.inOut',
    onComplete: () => leaving.finish(),
  });
}

// URL の #番号 からシーンを表示する。該当がなければ最初のシーン
function showFromHash() {
  const index = steps.findIndex((s) => '#' + s.n === location.hash);
  show(index === -1 ? 0 : index);
}

function goTo(index) {
  if (index < 0 || index >= steps.length) return;
  location.hash = steps[index].n;
}

window.addEventListener('hashchange', showFromHash);
showFromHash();

document.addEventListener('click', (e) => {
  if (e.target.closest('.next')) goTo(current + 1);
  if (e.target.closest('.back')) goTo(current - 1);
  // data-goto="番号" のボタンは、そのシーンへ移動する（例：最後の「TOPへ」）
  const jump = e.target.closest('[data-goto]');
  if (jump) location.hash = jump.dataset.goto;
});
