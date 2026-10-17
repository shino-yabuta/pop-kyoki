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

  // エンディングの音楽：シーン13〜15のあいだは流し続け、それ以外（TOPへ・BACK で12へ など）に移ったらフェードアウト
  if (BGM_SCENES.includes(next.n)) startBgm();
  else stopBgm();

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
  let fade = null;
  let started = false;
  const begin = () => {
    started = true;
    startNext();
  };
  // 前の画面のアニメーションを止めて元に戻し、非表示にする
  let cleared = false;
  const clearPrev = () => {
    if (cleared) return;
    cleared = true;
    if (prevCtx) prevCtx.revert();
    gsap.set(prev.el, { clearProps: 'opacity' });
    prev.el.classList.remove('is-active', 'is-leaving');
  };
  leaving = {
    finish() {
      if (fade) fade.kill();
      clearPrev();
      if (!started) begin();
      gsap.set(next.el, { clearProps: 'opacity' });
      leaving = null;
    },
  };

  // BACK や TOPへで戻るときは、今の画面が消えきってから次の画面を出す（2つの画面が重ならないように）
  if (isBack) {
    fade = gsap.to(prev.el, {
      opacity: 0,
      duration: 0.45,
      ease: 'power1.in',
      onComplete: () => {
        clearPrev();
        begin();
        fade = gsap.fromTo(next.el, { opacity: 0 }, {
          opacity: 1,
          duration: 0.45,
          ease: 'power1.out',
          onComplete: () => leaving.finish(),
        });
      },
    });
    return;
  }

  begin();
  // data-cut-in のある画面へ進むときは、フェードせず一瞬で切り替える（例：シーン7の暗転）
  if (next.el.hasAttribute('data-cut-in')) {
    leaving.finish();
    return;
  }
  fade = gsap.fromTo(next.el, { opacity: 0 }, {
    opacity: 1,
    duration: 0.9,
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

document.addEventListener('click', (e) => {
  if (e.target.closest('.next')) goTo(current + 1);
  if (e.target.closest('.back')) goTo(current - 1);
  // data-goto="番号" のボタンは、そのシーンへ移動する（例：最後の「TOPへ」）
  const jump = e.target.closest('[data-goto]');
  if (jump) location.hash = jump.dataset.goto;
});

// サウンドの ON/OFF（右上のボタンとトップのスイッチが連動）。最初は OFF。音を鳴らす処理は soundOn を見て判断する
let soundOn = false;
const soundToggle = document.querySelector('.sound-toggle');
soundToggle.addEventListener('click', () => {
  setSound(!soundOn);
  // フォーカスが残ると、シーン5で進むための Enter・スペースでも切り替わってしまうので外す
  soundToggle.blur();
});
const soundSwitch = document.querySelector('.sound-switch');
soundSwitch.addEventListener('click', () => setSound(!soundOn));
function setSound(on) {
  soundOn = on;
  // ON にした操作のときに音の準備をしておく（キーボードで切り替えた場合も）
  if (soundOn) prepareAudio();
  soundToggle.setAttribute('aria-pressed', soundOn);
  soundToggle.querySelector('.material-symbols-outlined').textContent = soundOn ? 'volume_up' : 'volume_off';
  soundSwitch.setAttribute('aria-checked', soundOn);
  soundSwitch.querySelector('.sound-switch-label').textContent = soundOn ? 'ON' : 'OFF';
  // OFF にしたら鳴っている音を止める。ON に戻したら、流しておく音（風）を再開する
  if (!soundOn) {
    Object.keys(playing).forEach((name) => stopSound(name));
    fadeWind(0, 0.3);
  } else {
    if (windWanted) startWind(1);
    if (bgmWanted) startBgm(1);
  }
}

// 音は Web Audio で鳴らす（<audio> より鳴るまでの遅れが少なく、タイミングがずれにくい）
// ブラウザは最初の操作があるまで音を出せないので、最初にマウスを押したときに準備する
let audioCtx = null;

// 効果音（assets/sound/名前.mp3）。ボタンを押すと基本はピコ（start）が鳴る
// 別の音にしたいボタンには data-sound="名前"、鳴らさないボタンには data-sound="none" を付ける
// シーンのアニメーションからは playSound('名前') で鳴らし、stopSound('名前', 秒) でフェードアウトして止める
const SOUND_NAMES = ['start', 'wall', 'hamon', 'zoom', 'drum', 'eye-open', 'eye-ripple', 'iina', 'sigh', 'typing', 'snap', 'popper', 'birds', 'ladder', 'climb', 'fever', 'angel', 'skate', 'ending'];
const buffers = {};
const playing = {};
// 最初に鳴らすときに遅れないよう、ページを開いた時点で読み込んで音のデータにしておく
const decoder = new OfflineAudioContext(2, 1, 44100);
SOUND_NAMES.forEach((name) => {
  fetch(`assets/sound/${name}.mp3`)
    .then((res) => res.arrayBuffer())
    .then((data) => decoder.decodeAudioData(data))
    .then((buffer) => { buffers[name] = buffer; });
});

// overlap を true にすると、前の音を止めずに重ねて鳴らす（短い間隔で何度も鳴らすとき）
// offset は音の途中から鳴らすときの開始位置（秒）。頭に無音やノイズがある素材で使う
// reverb は残響の量（0 でなし。1 で元の音と同じくらいの大きさの残響）
// 戻り値は鳴らした音（繰り返すときは戻り値の loop を true にする）。鳴らせなかったときは undefined
function playSound(name, volume = 1, overlap = false, offset = 0, reverb = 0) {
  if (!soundOn || !audioCtx || !buffers[name]) return;
  // 鳴っている途中なら止めて、頭から鳴らし直す
  if (!overlap) stopSound(name);
  const source = audioCtx.createBufferSource();
  source.buffer = buffers[name];
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(audioCtx.destination);
  if (reverb > 0) {
    const wet = audioCtx.createGain();
    wet.gain.value = reverb;
    gain.connect(getReverb()).connect(wet).connect(audioCtx.destination);
  }
  source.start(0, offset);
  if (overlap) return source;
  playing[name] = { source, gain };
  source.onended = () => {
    if (playing[name] && playing[name].source === source) delete playing[name];
  };
  return source;
}
// 鳴っている音の音量を、seconds 秒かけて volume まで変える（フェードイン：音量 0 で鳴らしてからこれで上げる）
function fadeSound(name, volume, seconds) {
  const sound = playing[name];
  if (!sound) return;
  const now = audioCtx.currentTime;
  sound.gain.gain.cancelScheduledValues(now);
  sound.gain.gain.setValueAtTime(sound.gain.gain.value, now);
  sound.gain.gain.linearRampToValueAtTime(volume, now + seconds);
}

// 残響（ホールのような響き）：だんだん小さくなるノイズを響きの型にして、音にたたみ込む
const REVERB_TIME = 1.5; // 残響の長さ（秒）
let reverbBuffer = null;
function getReverb() {
  if (!reverbBuffer) {
    const len = Math.floor(audioCtx.sampleRate * REVERB_TIME);
    reverbBuffer = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = reverbBuffer.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
  }
  // 鳴らすたびに作る（同じ残響の型を使い回す）
  const convolver = audioCtx.createConvolver();
  convolver.buffer = reverbBuffer;
  return convolver;
}
function stopSound(name, fade = 0) {
  const sound = playing[name];
  if (!sound) return;
  delete playing[name];
  const now = audioCtx.currentTime;
  sound.gain.gain.cancelScheduledValues(now);
  sound.gain.gain.setValueAtTime(sound.gain.gain.value, now);
  sound.gain.gain.linearRampToValueAtTime(0, now + fade);
  sound.source.stop(now + fade);
}

// ボタンは押し込んだ瞬間に沈むので、音もクリック（指を離したとき）ではなく押した瞬間に鳴らす
function prepareAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    // URL で直接シーン2〜6・13〜15を開いたときは、ここで風・音楽を流し始める
    if (windWanted) startWind();
    if (bgmWanted) startBgm();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
document.addEventListener('pointerdown', (e) => {
  prepareAudio();
  const button = e.target.closest('button');
  if (!button) return;
  const name = button.dataset.sound || 'start';
  if (name !== 'none') playSound(name);
});

// 風を切る音（シーン2〜6でずっと流す）：ブラウンノイズをコードで作り、こもらせて小さめに鳴らす
const WIND_VOLUME = 0.12;
let windGain = null;
let windWanted = false;
function setupWind() {
  // 10秒分のブラウンノイズ（ホワイトノイズを積み重ねて低い音を中心にする）
  const len = audioCtx.sampleRate * 10;
  const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  // ループのつなぎ目でプツッと鳴らないよう、終わりの値を始まりの値にそろえる
  const drift = data[len - 1] - data[0];
  for (let i = 0; i < len; i++) data[i] -= drift * (i / len);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  windGain = audioCtx.createGain();
  windGain.gain.value = 0;
  source.connect(filter).connect(windGain).connect(audioCtx.destination);
  source.start();
}
function fadeWind(volume, fade) {
  if (!windGain) return;
  const now = audioCtx.currentTime;
  windGain.gain.cancelScheduledValues(now);
  windGain.gain.setValueAtTime(windGain.gain.value, now);
  windGain.gain.linearRampToValueAtTime(volume, now + fade);
}
function startWind(fade = 2.5) {
  windWanted = true;
  // まだ一度もマウスを押していなければ、押したときに流し始める
  if (!soundOn || !audioCtx) return;
  if (!windGain) setupWind();
  fadeWind(WIND_VOLUME, fade);
}
function stopWind(fade = 1.5) {
  windWanted = false;
  fadeWind(0, fade);
}

// 時計のちくたく（シーン6）：ごく短いノイズをこもらせた「カチッ」を合成し、高い音（チク）と低い音（タク）を交互に鳴らす
const TICK_INTERVAL = 0.35; // 鳴らす間隔（秒）。普通の時計（1秒）より少し速め
let tickTimer = null;
function playTick(high) {
  if (!soundOn || !audioCtx) return;
  const len = Math.floor(audioCtx.sampleRate * 0.03);
  const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  // 鳴った瞬間がいちばん大きく、すぐに消えるノイズ
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = high ? 3200 : 2000;
  filter.Q.value = 8;
  const gain = audioCtx.createGain();
  gain.gain.value = 1.5;
  source.connect(filter).connect(gain).connect(audioCtx.destination);
  source.start();
}
function startTick() {
  stopTick();
  let high = true;
  playTick(high);
  tickTimer = setInterval(() => {
    high = !high;
    playTick(high);
  }, TICK_INTERVAL * 1000);
}
function stopTick() {
  clearInterval(tickTimer);
  tickTimer = null;
}

// エンディングの音楽（シーン13〜15で流し続ける）。曲が終わったら頭から繰り返す
const BGM_SCENES = ['13', '14', '15'];
const BGM_VOLUME = 0.4; // 曲が大きめなので、効果音が埋もれないよう小さく
let bgmWanted = false;
function startBgm(fade = 2) {
  bgmWanted = true;
  // まだ一度もマウスを押していなければ、押したときに流し始める。すでに流れていればそのまま
  if (!soundOn || !audioCtx || playing.ending) return;
  const bgm = playSound('ending', 0);
  if (!bgm) return;
  bgm.loop = true;
  fadeSound('ending', BGM_VOLUME, fade);
}
function stopBgm(fade = 2) {
  bgmWanted = false;
  stopSound('ending', fade);
}

// 最初のシーンを表示する（シーンの中で音の処理を使うので、音の準備を書いたこの最後で呼ぶ）
showFromHash();
