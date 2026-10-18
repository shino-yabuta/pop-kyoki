gsap.registerPlugin(MorphSVGPlugin);
// GPU 用の 3D 変形（translate3d）を使わない。iPhone（WebKit）では、動く要素を画像に焼き付けてから拡大するため、
// イラストの輪郭がギザギザになる。2D の変形なら、拡大しても図形として描き直されてなめらかなまま
gsap.config({ force3D: false });

// Figma の 1px に相当する長さ（CSS の --u と同じ。スマホは 16:9 の枠になるので、ステージの大きさで計算する）
const stageEl = document.getElementById('stage');
const unit = () => Math.min(stageEl.clientWidth / 1440, stageEl.clientHeight / 1024);

// メモ：GSAP で拡大・移動したボタンは、CSS の translate が none で上書きされ、押したときに沈まなくなる。
// 出てくる動きの終わりに clearProps: 'transform,translate,rotate,scale' で GSAP の変形を消しておく

// シーンごとのアニメーション。キーは data-scene の（最初の）番号
// シーンに入るたびに呼ばれ、離れるときに元の状態へ戻される
// step：URL で指定されたシーン番号。同じ画面内での移動は self.step() で受け取る
const sceneAnimations = {
  // クリエイティブの壁（2）→ 壁の上の人にズームイン（3）→ クリエイティブパーソン（4）→ いーな（5）→ 努力を続けますか？（6）
  2(el, self, step) {
    const q = gsap.utils.selector(el);
    const u = unit();

    // 壁の上の人物：髪をなびかせる／ストライプを右から左へ流す（ずっとループ）
    gsap.timeline({ repeat: -1, yoyo: true, defaults: { duration: 0.8, ease: 'sine.inOut' } })
      // shapeIndex: 0 で点の対応を固定し、根元が頭からずれないようにする
      .to(q('#hair'), { morphSVG: { shape: q('#hair-2')[0], shapeIndex: 0 } })
      .to(q('#hair'), { morphSVG: { shape: q('#hair-3')[0], shapeIndex: 0 } });
    gsap.to(q('.hair-stripe'), { x: -171 * Math.SQRT2, duration: 1, ease: 'none', repeat: -1 });

    // 虫眼鏡の波紋（ずっとループ）
    gsap.fromTo(q('.ripple'),
      { scale: 0.3, opacity: 1 },
      { scale: 1, opacity: 0, duration: 3.6, ease: 'power1.out', stagger: { each: 1.2, repeat: -1 } });

    // 空を流れる効果線（長い線＋短い線＋点）。初回だけ生成する
    const lines = q('.speed-lines')[0];
    if (!lines.children.length) {
      for (let i = 0; i < 7; i++) {
        const len = gsap.utils.random(120, 280, 10);
        const short = gsap.utils.random(24, 48, 4);
        lines.insertAdjacentHTML('beforeend',
          `<div class="speed-line"><i style="--len:${len}"></i><i style="--len:${short}"></i><i style="--len:4"></i></div>`);
      }
    }
    // 1本ずつ、線ごとに違う速さ・間隔で右から左へ流し続ける。高さは毎回ランダム（空の範囲＝壁の上端より上）
    const skyHeight = () => q('.wall')[0].getBoundingClientRect().top;
    gsap.utils.toArray(lines.children).forEach((line) => {
      gsap.fromTo(line,
        { x: () => innerWidth, y: () => gsap.utils.random(0.08, 0.92) * skyHeight() },
        {
          x: () => -line.offsetWidth,
          duration: gsap.utils.random(1, 1.8),
          ease: 'none',
          repeat: -1,
          repeatRefresh: true,
          repeatDelay: gsap.utils.random(0.2, 1.5),
          delay: gsap.utils.random(0, 2),
        });
    });
    // カメラの拡大を効果線だけ打ち消して、線の太さと速さを画面上で一定に保つ
    const camera = q('.camera')[0];
    const syncLines = () => {
      const s = gsap.getProperty(camera, 'scale');
      gsap.set(lines, {
        scale: 1 / s,
        x: -gsap.getProperty(camera, 'x') / s,
        y: -gsap.getProperty(camera, 'y') / s,
        transformOrigin: getComputedStyle(camera).transformOrigin,
      });
    };
    gsap.ticker.add(syncLines);

    // 帯の文字を右から左へ1つ分（728）ずつ流し続ける。CSS アニメーションは iPhone で GPU の層になり、
    // 拡大したときに近くのスケーターまで粗い画像になるので、GSAP の 2D の変形で動かす
    const wallFlow = gsap.to(q('.wall-text'), { x: -728 * u, duration: 8, ease: 'none', repeat: -1, paused: true });

    // 登場の流れ
    const intro = gsap.timeline()
      // 壁がゴゴゴとせり上がる（上がりながら細かく揺れる）。音は半分の音量で鳴らし、上がりきる直前にフェードアウト
      .call(() => playSound('wall', 0.5), null, 0)
      .call(() => stopSound('wall', 0.5), null, 1.3)
      // 壁の音が消えていくのに合わせて、風を切る音を流し始める（シーン6まで流し続ける）
      .call(() => startWind(), null, 1.3)
      .from(q('.wall'), { yPercent: 100, duration: 1.8, ease: 'power1.inOut' }, 0)
      .to(q('.wall'), { x: () => gsap.utils.random(-3, 3) * u, duration: 0.05, repeat: 33, repeatRefresh: true, ease: 'none' }, 0)
      .to(q('.wall'), { x: 0, duration: 0.05 })
      // 壁がせり上がりきってから人物を表示
      .from(q('.me'), { y: '30%', autoAlpha: 0, duration: 1.2, ease: 'power2.out' }, '+=0.2')
      // 帯は壁が上がりきったらすぐに表示（人物と重ねて出す）
      .from(q('.wall-text, .wall-text-strong'), { autoAlpha: 0, duration: 1.4, ease: 'sine.inOut' }, 1.8)
      // 左右の縦文字（超えられない／高い壁）：帯と重ねて出し始め、2行を同時に出す
      .from(q('.tategaki-right, .tategaki-left'), { autoAlpha: 0, duration: 0.7 }, '-=0.4')
      // 強調を消す → 帯が流れ始める（流れる動きは wallFlow） → スケーター登場
      .to(q('.wall-text-strong'), { autoAlpha: 0, duration: 0.8 }, '+=0.3')
      .call(() => wallFlow.play())
      .to(q('.speed-lines'), { autoAlpha: 1, duration: 0.8 }, '<')
      .from(q('.skater-wrap:not(.skater-color)'), { autoAlpha: 0, duration: 1.2 }, '+=0.3')
      // 少し間をおいて吹き出しへ（白文字はシーン2のあいだ消さずに残す）
      // 吹き出し：小さい丸 → 本体をぽぽんと続けて出し、左 → 右はひと呼吸ずらす
      .addLabel('bubbles', '+=1.1')
      .from([...q('.dot-l2'), ...q('.dot-l1'), ...q('.bubble-l')],
        { scale: 0, autoAlpha: 0, duration: 0.35, stagger: 0.15, ease: 'back.out(2)' }, 'bubbles')
      .from([...q('.dot-r1'), ...q('.bubble-r')],
        { scale: 0, autoAlpha: 0, duration: 0.35, stagger: 0.15, ease: 'back.out(2)' }, 'bubbles+=0.8')
      .from(q('.zoom'), { scale: 0, autoAlpha: 0, duration: 0.6, ease: 'back.out(1.7)' }, '+=0.4')
      // 虫眼鏡が出たら、波紋の音（ぼわんぼわんと弱まっていく）を繰り返し鳴らす
      // （登場の途中で URL から 3 以降へ移っていたら鳴らさない）
      .call(() => { if (steps.time() === steps.labels.s2) startHamon(); }, null, '<')
      .from(q('.back'), { autoAlpha: 0, duration: 0.6 }, '<');

    // タイプライター用に、タイトルを1文字ずつ span に分ける（初回だけ）
    const title = q('.person-title')[0];
    if (!title.querySelector('.char')) {
      title.innerHTML = [...title.textContent.trim()].map((c) => `<span class="char">${c}</span>`).join('');
    }

    // まぶたは最初は白目の上に隠しておく（白目の形で切り抜いているので見えない）
    gsap.set(q('.eye-lid'), { y: -310 });

    // 虫眼鏡の波紋の音：虫眼鏡が出ているあいだ、波紋1つが広がって消えるまで（3.6秒）ごとに鳴らす
    let hamonLoop = null;
    const startHamon = () => {
      stopHamon(0);
      // 素材が小さめなので 1.6 倍
      playSound('hamon', 1.6);
      hamonLoop = setInterval(() => playSound('hamon', 1.6), 3600);
    };
    const stopHamon = (fade = 0.5) => {
      clearInterval(hamonLoop);
      hamonLoop = null;
      stopSound('hamon', fade);
    };

    // 3 以降の流れ。ラベル s2 / s3 / s4 の位置まで再生（戻るときは逆再生）して切り替える
    const steps = gsap.timeline({ paused: true })
      .addLabel('s2')
      // ズームイン（3）
      .to(q('.zoom'), { autoAlpha: 0, duration: 0.3 })
      .to(q('.me, .bubble, .bubble-dot, .tategaki'), { autoAlpha: 0, duration: 0.6 }, '<')
      // 壁の上の人を中心に、画面全体を同じ倍率で拡大する（基点は CSS の --zoom-x / --zoom-y）
      .to(q('.camera'), { scale: 6, duration: 2, ease: 'power2.inOut' }, 's2')
      // 同心円のあしらい：カメラと一緒に広がる。ズームの前半で現れて、後半で消える
      .to(q('.zoom-fx'), { autoAlpha: 1, duration: 0.6 }, 's2+=0.1')
      .to(q('.zoom-fx'), { autoAlpha: 0, duration: 0.8 }, 's2+=1.3')
      // 色を戻す（カラー版を重ねてフェードイン）
      .to(q('.skater-color'), { opacity: 1, duration: 1.5 }, 's2+=0.5')
      // ズームと色が戻ったあとにボタンを表示
      .fromTo(q('.btn-are'), { autoAlpha: 0, y: 20 * u }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out', immediateRender: false, clearProps: 'transform,translate,rotate,scale' }, '+=0.2')
      .addLabel('s3')
      // クリエイティブパーソン（4）：ボタンを消し、さらに少し寄る
      .to(q('.btn-are'), { autoAlpha: 0, duration: 0.3 })
      .to(q('.camera'), { scale: 10.92, x: 40 * u, y: -45 * u, duration: 1.2, ease: 'power2.inOut' }, '<')
      // 赤い帯をフェードインし、タイトルをタイプライターで1文字ずつ表示
      .addLabel('s4band', '-=0.3')
      .to(q('.person-band'), { autoAlpha: 1, duration: 0.8 }, 's4band')
      .addLabel('s4title', '+=0.2')
      .to(q('.person-title .char'), { visibility: 'visible', duration: 0.01, stagger: 0.1 }, 's4title')
      .to(q('.person-band .btn-white'), { autoAlpha: 1, duration: 1.2, ease: 'sine.inOut' }, '+=1')
      .addLabel('s4')
      // いーな（5）：赤い帯を消してオーバーレイを重ねる
      .to(q('.person-band, .back'), { autoAlpha: 0, duration: 0.5 })
      .to(q('.s5-overlay'), { autoAlpha: 1, duration: 0.8 }, '<')
      .addLabel('s5in')
      // 白いパネルと目（瞳にはシーン4のスケーターが映る）
      .fromTo(q('.s5-panel'), { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'power2.out', immediateRender: false })
      .addLabel('s5eye', '-=0.2')
      .fromTo(q('.s5-eye'), { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(1.6)', immediateRender: false }, 's5eye')
      // 右 → 左 → 上 → 下 の順に白文字を表示。1つずつ 1 秒おきに（出始めに「ぶおん」を鳴らす。ラベル s5text1〜4）
      .addLabel('s5text1', '+=0.3')
      .to(q('.s5-right'), { autoAlpha: 1, duration: 1 }, 's5text1')
      .addLabel('s5text2', 's5text1+=1')
      .to(q('.s5-left'), { autoAlpha: 1, duration: 1 }, 's5text2')
      .addLabel('s5text3', 's5text2+=1')
      .to(q('.s5-top'), { autoAlpha: 1, duration: 1 }, 's5text3')
      .addLabel('s5text4', 's5text3+=1')
      .to(q('.s5-bottom'), { autoAlpha: 1, duration: 1 }, 's5text4')
      // 文字が出そろったらここで止まり、閲覧者のクリックを待つ（読み切れるように）
      .addLabel('s5read')
      // ひと呼吸おいて伏し目（eye2）に：文字を消し、まぶたが下りて、瞳がグレーに、まつ毛が下向きに
      .addLabel('s5lid', '+=0.3')
      .to(q('.s5-text'), { autoAlpha: 0, duration: 0.8 }, 's5lid')
      .to(q('.lashes-up'), { opacity: 0, duration: 0.3 }, 's5lid')
      .to(q('.eye-lid'), { y: 0, duration: 0.8, ease: 'power2.inOut' }, 's5lid')
      .to(q('.eye-iris'), { opacity: 1, duration: 0.5 }, 's5lid+=0.4')
      // 下向きのまつ毛は、まぶたが下りきる直前から、まぶたと一緒に下りてくるようにふわっと出す
      .fromTo(q('.lashes-down'), { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 's5lid+=0.5')
      // ひと呼吸おいて「いーな」の吹き出しがポンポン出る（順番はばらばら）
      .addLabel('iina', '+=0.8')
      .fromTo(gsap.utils.shuffle(q('.iina-bubble')),
        { autoAlpha: 0, scale: 0 },
        { autoAlpha: 1, scale: 1, duration: 0.4, stagger: 0.25, ease: 'back.out(2)', immediateRender: false }, 'iina')
      // 文字を消し、吹き出しが膨らんで背景をネイビーで埋め尽くす
      .to(q('.iina-bubble span'), { opacity: 0, duration: 0.5 }, '+=0.5')
      .to(q('.iina-bubble'), { scale: 4, duration: 1, stagger: 0.05, ease: 'power2.in' }, '-=0.1')
      .to(q('.s5-navy'), { autoAlpha: 1, duration: 0.6 }, '-=0.6')
      // ネイビーになるのに合わせて、まぶたを伏し目の最終形（eye3）へ。白いパネルは役目を終えて消す
      .to(q('.s5-panel'), { autoAlpha: 0, duration: 0.6 }, '<')
      .to(q('.eye-lid'), { morphSVG: q('#lid-3')[0], duration: 0.6, ease: 'sine.inOut' }, '<')
      .to(q('.lash-mid'), { y: 69.737, duration: 0.6, ease: 'sine.inOut' }, '<')
      .to(q('.lash-center'), { y: 89.737, duration: 0.6, ease: 'sine.inOut' }, '<')
      .addLabel('s5navy')
      .to(q('.iina-bubble'), { autoAlpha: 0, duration: 0.3 })
      // （いーな）→ BACK と NEXT
      .to(q('.s5-iina'), { autoAlpha: 1, duration: 1 }, '+=0.3')
      .to(q('.back, .btn-next'), { autoAlpha: 1, duration: 0.6 }, '+=0.4')
      .addLabel('s5')
      // 努力を続けますか？（6）：シーン5の要素を消し、オーバーレイの下の壁を暗くする
      .to(q('.s5-layer, .btn-next, .back'), { autoAlpha: 0, duration: 0.6 })
      .to(q('.wall-shade'), { autoAlpha: 1, duration: 0.6 }, '<')
      .addLabel('s6in')
      // 3つのコマが左 → 中 → 右の順に下から上がってくる（下の文字も一緒に）
      .fromTo(q('.koma'), { y: innerHeight * 0.6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out', stagger: 0.5, immediateRender: false })
      // ここで止まり、2秒後に「下へ」の矢印を出してクリックを待つ（s6wait）
      .addLabel('s6wait')
      // 矢印を押したら、コマが上へ抜け、同時に2つのパネルが下から上がってくる
      // 同じ速さ・同じタイミングで動かし、コマがパネルに押し上げられるように見せる
      .addLabel('s6komaOut', 's6wait')
      .to(q('.koma'), { y: -innerHeight, duration: 1.4, ease: 'power2.inOut' }, 's6komaOut')
      .fromTo(q('.q-panel'), { y: innerHeight, autoAlpha: 1 }, { y: 0, autoAlpha: 1, duration: 1.4, ease: 'power2.inOut', immediateRender: false }, '<')
      .addLabel('s6slideEnd')
      // 上のテキスト → 下のテキストとボタン → BACK
      .to(q('.s6-quote'), { autoAlpha: 1, duration: 1 }, '+=0.2')
      .to(q('.s6-question, .s6-answers'), { autoAlpha: 1, duration: 1 }, '+=0.4')
      .to(q('.back'), { autoAlpha: 1, duration: 0.6 }, '+=0.4')
      .addLabel('s6');

    // シーン5の白文字が1つ出るたびに「ぶおん」
    [1, 2, 3, 4].forEach((i) => steps.call(() => playWarp(), null, `s5text${i}`));

    // 「いーな」の吹き出しが1つ出るたびに音を鳴らす（前の音を止めずに重ねる）
    q('.iina-bubble').forEach((b, i) => {
      steps.call(() => playSound('iina', 1.8, true), null, `iina+=${i * 0.25}`);
    });
    // 3つのコマが出ているあいだ（上がり始めてから、矢印を押して上へ抜け始めるまで）、時計のちくたくを鳴らす
    // （「はい」で s6in から再生し直したときにも鳴るよう、s6in の少しあと）
    steps.call(() => startTick(), null, 's6in+=0.01');
    // 止める位置は s6wait と同じ時刻なので、少しあと（矢印を押してスライドが始まってから）にする
    steps.call(() => stopTick(), null, 's6komaOut+=0.01');
    // ネイビーで塗りつぶされたら、ため息（素材の頭の2秒近くはノイズだけなので、1.8秒目から鳴らす）
    steps.call(() => playSound('sigh', 1, false, 1.8), null, 's5navy');

    // 左のコマの時計：長針は2秒、短針は24秒で1周（ずっとループ）
    gsap.to(q('.clock-minute'), { rotation: 360, svgOrigin: '211.667 161.5', duration: 2, ease: 'none', repeat: -1 });
    gsap.to(q('.clock-hour'), { rotation: 360, svgOrigin: '211.667 161.5', duration: 24, ease: 'none', repeat: -1 });

    // 右のコマの目玉：左 → 下 → 右 → 上（反時計回り）の楕円に沿って回し続ける
    // 楕円の中心と半径は、4パターンの黒目の位置から求めた値（コマの座標）
    const iris = q('.bloody-iris')[0];
    const orbit = { angle: Math.PI };
    gsap.to(orbit, {
      angle: -Math.PI,
      duration: 2.4,
      ease: 'none',
      repeat: -1,
      onUpdate: () => gsap.set(iris, {
        x: 208.49 + 122.8 * Math.cos(orbit.angle) - 85.73,
        y: 177.57 + 94.5 * Math.sin(orbit.angle) - 184.53,
      }),
    });

    // 戻るときに逆再生せず、まとめてフェードアウトさせる範囲
    // （戻り先のシーン番号: そのシーンの演出が始まるラベルと、フェードアウトさせる要素）
    const fadeBack = {
      3: { label: 's4band', targets: '.person-band' },
      4: { label: 's5in', targets: '.s5-layer, .btn-next' },
      5: { label: 's6in', targets: '.s6-layer' },
    };

    // シーン5：文字を読み終えるまで待つ。瞳から波紋を出して合図し、画面のどこか（または Enter・スペース・→）で進む
    let waiting = null;
    const stopWaiting = () => {
      if (waiting) waiting.kill();
      waiting = null;
    };
    self.add('waitRead', () => {
      const ripple = gsap.timeline({ delay: 1.5 })
        .set(q('.s5-eye-ripples'), { autoAlpha: 1 })
        .fromTo(q('.s5-eye-ripple'), { scale: 1, opacity: 1 }, { scale: 1.35, opacity: 0, duration: 2.4, ease: 'power1.out', stagger: { each: 0.8, repeat: -1 } });
      // 波紋が出ているあいだ、輪1つが広がって消えるまで（2.4秒）ごとに音を鳴らす
      const rippleSound = gsap.timeline({ delay: 1.5, repeat: -1, repeatDelay: 2.4 })
        .call(() => playSound('eye-ripple'));
      gsap.set(el, { cursor: 'pointer' });
      const go = (e) => {
        if (e.type === 'keydown' && !['Enter', ' ', 'ArrowRight'].includes(e.key)) return;
        stopWaiting();
        move = steps.tweenTo('s5');
      };
      el.addEventListener('click', go);
      window.addEventListener('keydown', go);
      waiting = {
        kill() {
          ripple.kill();
          rippleSound.kill();
          stopSound('eye-ripple', 0.5);
          gsap.set(q('.s5-eye-ripples'), { autoAlpha: 0 });
          gsap.set(el, { cursor: '' });
          el.removeEventListener('click', go);
          window.removeEventListener('keydown', go);
        },
      };
    });

    // シーン6：3コマを見せたら、2秒後に「下へ」の矢印を出し、押されたらパネルへスライドする
    let waitingKoma = null;
    const stopWaitKoma = () => {
      if (waitingKoma) waitingKoma.kill();
      waitingKoma = null;
    };
    self.add('waitKoma', () => {
      const down = q('.s6-down')[0];
      const show = gsap.fromTo(down, { autoAlpha: 0, y: -10 * u }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 2 });
      const go = () => {
        stopWaitKoma();
        move = steps.tweenTo('s6');
      };
      down.addEventListener('click', go);
      waitingKoma = {
        kill() {
          show.kill();
          gsap.to(down, { autoAlpha: 0, duration: 0.2 });
          down.removeEventListener('click', go);
        },
      };
    });

    let move;
    let soundCall;
    self.add('step', (n) => {
      if (move) move.kill();
      stopWaiting();
      stopWaitKoma();
      // 虫眼鏡が消えるので波紋の音を止める（2 に戻ったら、虫眼鏡がまた出たところで再開する）
      stopHamon();
      stopTick();
      // 2 から 3 へ進むとき（虫眼鏡を押してズームするとき）だけ、ズームの音を鳴らす
      if (n === '3' && steps.time() < steps.labels.s3) playSound('zoom');
      // タイムラインのラベルの位置（＋ずらす秒数）で音を鳴らす。前の予約は取り消す
      if (soundCall) soundCall.kill();
      const cue = (name, label, offset = 0, volume = 1) => {
        soundCall = gsap.delayedCall(steps.labels[label] - steps.time() + offset, () => playSound(name, volume));
      };
      // 3 から 4 へ進むとき：クリエイティブパーソンのタイトルの1文字目が出る 0.1 秒前にドラム
      if (n === '4' && steps.time() <= steps.labels.s3) cue('drum', 's4title', -0.1);
      // 4 から 5 へ進むとき：目が出るのと同時に eye-open
      if (n === '5' && steps.time() <= steps.labels.s4) cue('eye-open', 's5eye', 0, 1.8);
      // 6 へ進むときは、3コマが出たところで止めて「下へ」の矢印を待つ
      if (n === '6' && steps.time() < steps.labels.s6wait) {
        move = steps.tweenTo('s6wait', { onComplete: () => self.waitKoma() });
        return;
      }
      // 5 へ進むときは、文字が出そろったところで止めてクリックを待つ
      if (n === '5' && steps.time() < steps.labels.s5read) {
        move = steps.tweenTo('s5read', { onComplete: () => self.waitRead() });
        return;
      }
      const back = fadeBack[n];
      if (back && steps.time() > steps.labels[back.label]) {
        move = gsap.to(q(back.targets), {
          autoAlpha: 0,
          duration: 0.5,
          onComplete: () => {
            steps.seek(back.label);
            gsap.set(q(back.targets), { clearProps: 'opacity,visibility' });
            move = steps.tweenTo('s' + n);
          },
        });
        return;
      }
      move = steps.tweenTo('s' + n, n === '2' ? { onComplete: startHamon } : {});
    });

    // 「はい」：質問を消して、スライドを逆にたどって3コマへ戻る（パネルが下へ、コマが上から）。また矢印を待つ
    const replayKoma = () => {
      if (move) move.kill();
      const question = q('.s6-quote, .s6-question, .s6-answers');
      move = gsap.to([...question, ...q('.back')], {
        autoAlpha: 0,
        duration: 0.5,
        onComplete: () => {
          steps.seek('s6slideEnd');
          gsap.set(question, { clearProps: 'opacity,visibility' });
          move = steps.tweenTo('s6wait', {
            onComplete: () => {
              startTick();
              self.waitKoma();
            },
          });
        },
      });
    };
    const yes = q('.btn-yes')[0];
    yes.addEventListener('click', replayKoma);

    // URL で直接 3 以降を開いたときは、その状態から表示する
    if (step !== '2') {
      // 途中の音は鳴らさない（true でコールバックを呼ばずに進める）
      intro.progress(1, true);
      wallFlow.play();
      startWind();
      steps.seek('s' + step);
    }

    // シーンを離れるときに後片付け
    return () => {
      stopWaiting();
      stopWaitKoma();
      stopSound('wall');
      stopHamon(0);
      stopTick();
      stopWind();
      gsap.ticker.remove(syncLines);
      yes.removeEventListener('click', replayKoma);
    };
  },

  // GIVE UP → パチン（7）
  7(el, self, step, isBack) {
    const q = gsap.utils.selector(el);
    const u = unit();

    // タイプライター用に、GIVE UP を1文字ずつ span に分ける（初回だけ）
    const giveup = q('.s7-giveup')[0];
    if (!giveup.querySelector('.char')) {
      giveup.innerHTML = [...giveup.textContent.trim()].map((c) => `<span class="char">${c}</span>`).join('');
    }
    const chars = q('.s7-giveup .char');

    // 開いた目のズームアウト：瞳の中の手が、パチンの場面の手とぴったり重なる倍率と基点から始める
    // （Figma 座標で、パチンの手は左上 451.5, 56・等倍、瞳の中の手は左上 603, 288・0.432倍）
    const zoomFrom = 1 / 0.432;
    const origin = { x: (603 - 0.432 * 451.5) / (1 - 0.432), y: (288 - 0.432 * 56) / (1 - 0.432) };
    // 目の SVG の左上（Figma 座標で 240, 116）からの位置に直して、拡大の基点にする
    const zoomOrigin = `${(origin.x - 240) * u}px ${(origin.y - 116) * u}px`;

    const tl = gsap.timeline()
      // 暗転した画面に伏し目（eye3）が出て、さらにまぶたが下がる（eye4）
      .to(q('.s7-eye-closed'), { autoAlpha: 1, duration: 1 }, 0.4)
      .to(q('.s7-lid'), { morphSVG: q('#s7-lid-4')[0], duration: 1.4, ease: 'sine.inOut' }, '+=0.4')
      .addLabel('closing', '<');
    q('.s7-lash').forEach((lash, i) => {
      tl.to(lash, { morphSVG: q('#s7-lash-4-' + i)[0], duration: 1.4, ease: 'sine.inOut' }, 'closing');
    });

    // GIVE UP をタイプ（文字は0.18秒、点は0.35秒ずつ）
    let t = tl.duration() + 0.5;
    // タイプしているあいだキーボードの音を鳴らす（素材の頭の無音を飛ばして 0.2 秒目から）
    tl.call(() => playSound('typing', 1, false, 0.2), null, t);
    let lastKey = t;
    chars.forEach((c) => {
      tl.set(c, { autoAlpha: 1 }, t);
      lastKey = t;
      t += c.textContent === '.' ? 0.35 : 0.18;
    });
    // 最後の1文字が出たところで止める
    tl.call(() => stopSound('typing', 0.1), null, lastKey);

    // パチン！：目と文字を一瞬で消し、爆発と手を出す。白いフラッシュと画面の揺れで衝撃を出す
    // 打ち終わってから余韻をおいてパチン
    tl.addLabel('snap', t + 1)
      // 音：指パッチン（頭の無音を飛ばして 0.12 秒目から）とクラッカーを重ねて鳴らす。残響で余韻を足す
      // 2つを重ねると上限を超えて音割れするので、それぞれ 0.85 倍にする
      .call(() => {
        playSound('snap', 0.85, false, 0.12, 0.8);
        playSound('popper', 1.2, false, 0, 0.8);
      }, null, 'snap')
      .set(q('.s7-eye-closed, .s7-giveup'), { autoAlpha: 0 }, 'snap')
      .fromTo(q('.s7-burst'), { autoAlpha: 1, scale: 0 }, { scale: 1.15, duration: 0.12, ease: 'power2.out', immediateRender: false }, 'snap')
      .to(q('.s7-burst'), { scale: 1, duration: 0.25, ease: 'power2.inOut' })
      .fromTo(q('.s7-hand-wrap'), { autoAlpha: 1, scale: 0.7, transformOrigin: '50% 100%' }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)', immediateRender: false }, 'snap')
      .fromTo(q('.s7-flash'), { autoAlpha: 0.85 }, { autoAlpha: 0, duration: 0.25, immediateRender: false }, 'snap')
      // キラキラ：はじいた瞬間に大きめでパッと出て一瞬で締まり、フェードせずにパッと消える
      .fromTo(q('.s7-sparkle'), { autoAlpha: 1, scale: 1.4 }, { scale: 1, duration: 0.08, ease: 'power2.out', immediateRender: false }, 'snap')
      .set(q('.s7-sparkle'), { autoAlpha: 0 }, 'snap+=0.22')
      .to(el, { x: () => gsap.utils.random(-8, 8) * u, y: () => gsap.utils.random(-8, 8) * u, duration: 0.04, repeat: 5, repeatRefresh: true }, 'snap')
      .to(el, { x: 0, y: 0, duration: 0.04 })
      // 余韻：爆発がゆっくり脈打つ
      .to(q('.s7-burst-shape'), { scale: 1.03, transformOrigin: '50% 50%', duration: 0.4, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 'snap+=0.4')
      // 青へ：背景と爆発の色を変える。手を瞳の中の手に差し替え、開いた目ごとカメラが引くように縮める
      .addLabel('blue', 'snap+=1.2')
      .to(el, { backgroundColor: '#37d3f0', duration: 0.8 }, 'blue')
      .to(q('.s7-burst-blue'), { autoAlpha: 1, duration: 0.8 }, 'blue')
      .to(q('.s7-hand-wrap'), { autoAlpha: 0, duration: 0.3 }, 'blue')
      .fromTo(q('.s7-eye-open'), { autoAlpha: 1, scale: zoomFrom, transformOrigin: zoomOrigin }, { scale: 1, duration: 1.4, ease: 'power2.inOut', immediateRender: false }, 'blue')
      .to(q('.s7-eye-frame'), { opacity: 1, duration: 0.8 }, 'blue+=0.2')
      // ボタン → BACK
      .to(q('.s7-btn'), { autoAlpha: 1, duration: 0.6 }, '+=0.4')
      .to(q('.back'), { autoAlpha: 1, duration: 0.6 }, '+=0.4');

    // BACK で戻ってきたときは、最後の状態（瞳の中の手と「え!?」ボタン）から表示する（途中の音は鳴らさない）
    if (isBack) tl.progress(1, true);

    return () => stopSound('typing');
  },

  // 私とスケーター（8）：パネルを左右にスライドする
  8(el, self, step, isBack) {
    const q = gsap.utils.selector(el);

    // 2枚目のスケーターの髪のストライプを右から左へ流す（ずっとループ）
    gsap.to(q('.s8-hair-stripe'), { x: -33 * Math.SQRT2, duration: 0.6, ease: 'none', repeat: -1 });

    // 登場：パネル → 私 → › ボタン
    const intro = gsap.timeline()
      .fromTo(q('.s8-slide:first-child .s8-panel'), { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'power2.out' }, 0.3)
      .to(q('.s8-me'), { autoAlpha: 1, duration: 0.8 }, '+=0.1')
      .to(q('.s8-arrow-next'), { autoAlpha: 1, duration: 0.6 }, '+=0.3');

    // 2枚目に初めて来たときだけ、吹き出し → BACK を出す。2回目以降は出たまま
    let bubbleShown = false;
    const showBubble = () => {
      if (bubbleShown) return null;
      bubbleShown = true;
      return gsap.timeline()
        .fromTo(q('.s8-bubble'), { autoAlpha: 0, scale: 0.6, transformOrigin: '0% 55%' }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(1.8)' }, 0.2)
        .to(q('.back'), { autoAlpha: 1, duration: 0.6 }, '+=0.4');
    };

    // スライド（1枚目は左へ抜け、2枚目が右から入る）
    const slideTo = (i) => gsap.to(q('.s8-track'), {
      xPercent: -100 * i,
      duration: 0.7,
      ease: 'power2.inOut',
      overwrite: true,
      onComplete: i === 1 ? showBubble : null,
    });
    const next = q('.s8-arrow-next')[0];
    const prev = q('.s8-arrow-prev')[0];
    const toSecond = () => slideTo(1);
    const toFirst = () => slideTo(0);
    next.addEventListener('click', toSecond);
    prev.addEventListener('click', toFirst);

    // BACK で戻ってきたときは、2枚目で吹き出しと BACK が出ている状態から表示する
    if (isBack) {
      intro.progress(1);
      gsap.set(q('.s8-track'), { xPercent: -100 });
      showBubble().progress(1);
    }

    return () => {
      next.removeEventListener('click', toSecond);
      prev.removeEventListener('click', toFirst);
    };
  },

  // 鏡（9）
  9(el, self, step, isBack) {
    const q = gsap.utils.selector(el);
    const u = unit();

    // タイプライター用に、2行のテキストを1文字ずつ span に分ける（初回だけ）
    q('.s9-line').forEach((line) => {
      if (!line.querySelector('.char')) {
        line.innerHTML = [...line.textContent.trim()].map((c) => `<span class="char">${c}</span>`).join('');
      }
    });

    // 鏡に映る私の髪のストライプを流す（鏡なので左右反転して見える）
    gsap.to(q('.s9-hair-stripe'), { x: -111 * Math.SQRT2, duration: 1.2, ease: 'none', repeat: -1 });

    // 鏡に映る私は、鏡の動きを打ち消して本物の私と同じ位置に置く（鏡の SVG は 1 単位 = Figma の 1px）
    const me = q('.s9-me')[0];
    const mirror = q('.s9-mirror')[0];
    const reflection = q('.s9-reflection')[0];
    const syncReflection = () => {
      gsap.set(reflection, { y: (gsap.getProperty(me, 'y') - gsap.getProperty(mirror, 'y')) / u });
    };
    gsap.ticker.add(syncReflection);

    const tl = gsap.timeline()
      // 私は下から、鏡は上から同時に入ってくる
      .from(me, { y: innerHeight, duration: 1.4, ease: 'power3.out' }, 0.3)
      .from(mirror, { y: -innerHeight * 1.2, duration: 1.4, ease: 'power3.out' }, 0.3)
      // 鏡が差し出されたら、朝の鳥の声を背景に流す（目が醒めるシーン。繰り返し）
      .call(() => {
        const birds = playSound('birds');
        if (birds) birds.loop = true;
      }, null, '>')
      // 3秒そのまま → 暗いオーバーレイ
      .to(q('.s9-overlay'), { autoAlpha: 1, duration: 0.8 }, '+=3');
    // 2行をタイプ（1文字0.12秒、行の間は0.4秒）
    let t = tl.duration() + 0.3;
    q('.s9-line').forEach((line) => {
      line.querySelectorAll('.char').forEach((c) => {
        tl.set(c, { autoAlpha: 1 }, t);
        t += 0.12;
      });
      t += 0.4;
    });
    tl.to(q('.s9-btn'), { autoAlpha: 1, duration: 0.6 }, t + 0.2)
      .to(q('.back'), { autoAlpha: 1, duration: 0.6 }, '+=0.4');

    // BACK で戻ってきたときは、最後の状態から表示する
    if (isBack) tl.progress(1);

    // 次（ハシゴの音）へ進むときや BACK のときは、画面が切り替わる前に鳥の声を消しておく
    const quietBirds = (e) => {
      if (e.target.closest('.next, .back')) stopSound('birds', 0.4);
    };
    el.addEventListener('pointerdown', quietBirds);

    return () => {
      gsap.ticker.remove(syncReflection);
      el.removeEventListener('pointerdown', quietBirds);
      stopSound('birds');
    };
  },

  // ハシゴを登る（10）
  10(el, self, step, isBack) {
    const q = gsap.utils.selector(el);
    const u = unit();
    const STEP = 240; // 1回で登る量（横木2本分）
    const fills = q('.s10-fill');
    const climb = q('.s10-climb')[0];
    let count = 0;
    let busy = false;

    // てっぺんに着いたあと：「登る」を消し、「さあ！」→ BACK
    const finish = () => gsap.timeline()
      .to(climb, { autoAlpha: 0, duration: 0.3 })
      .fromTo(q('.s10-go'), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(1.8)', clearProps: 'transform,translate,rotate,scale' }, '+=0.2')
      .to(q('.back'), { autoAlpha: 1, duration: 0.6 }, '+=0.4');

    // 「登る」：1目盛り塗り、壁とハシゴをまとめて下へ（ぐっと沈んでから少し戻る）
    const climbOnce = () => {
      if (busy || count >= fills.length) return;
      busy = true;
      const y = (count + 1) * STEP * u;
      gsap.timeline({ onComplete: () => { busy = false; if (count >= fills.length) finish(); } })
        // 登る音：1歩ずつゆっくり「トン・トン」と2回。同じ大きさだと機械的に聞こえるので、2歩目は少し小さく
        // （タイムラインに入れているので、2歩目が鳴るまで次の「登る」は受け付けない）
        .call(() => playSound('climb', 0.7, true), null, 0)
        .call(() => playSound('climb', 0.6, true), null, 0.6)
        .to(fills[count], { scaleY: 1, duration: 0.4, ease: 'power2.out' }, 0)
        .to(q('.s10-world'), { y: y + 24 * u, duration: 0.35, ease: 'power2.out' }, 0)
        .to(q('.s10-world'), { y, duration: 0.3, ease: 'sine.inOut' }, 0.35);
      count += 1;
    };
    climb.addEventListener('click', climbOnce);

    // 登場：ハシゴが上から降りてくる → バロメーターと「登る」
    const intro = gsap.timeline()
      // ハシゴが降りてくる音（動き出すのと同時に）
      .call(() => playSound('ladder'), null, 0.3)
      .from(q('.s10-ladder'), { y: -3000 * u, duration: 1.8, ease: 'power2.out' }, 0.3)
      .to(q('.s10-meter'), { autoAlpha: 1, duration: 0.6 }, '+=0.2')
      .to(climb, { autoAlpha: 1, duration: 0.6 }, '<0.2');

    // BACK で戻ってきたときは、登りきった状態から表示する
    if (isBack) {
      // 途中の音は鳴らさない
      intro.progress(1, true);
      count = fills.length;
      gsap.set(fills, { scaleY: 1 });
      gsap.set(q('.s10-world'), { y: count * STEP * u });
      finish().progress(1);
    }

    return () => {
      climb.removeEventListener('click', climbOnce);
      stopSound('ladder');
    };
  },

  // 解放しなよ（11）
  11(el, self, step, isBack) {
    const q = gsap.utils.selector(el);

    // タイプライター用に、2行のテキストを1文字ずつ span に分ける（初回だけ）
    q('.s11-line').forEach((line) => {
      if (!line.querySelector('.char')) {
        line.innerHTML = [...line.textContent.trim()].map((c) => `<span class="char">${c}</span>`).join('');
      }
    });

    // バロメーターが左から右へ 0 → 100 と伸び、100 になったらぱっと消えて、また 0 から伸びる
    const fever = (fill) => gsap.fromTo(fill,
      { width: '0%' },
      { width: '100%', duration: 0.8, ease: 'power1.in', repeat: -1, repeatDelay: 0.1 });
    const redFever = fever(q('.s11-bar-red')[0]);
    const blueFever = fever(q('.s11-bar-blue')[0]).pause();

    // 右のスイッチの「押せる」合図（スイッチの形の波紋）
    const ripple = gsap.fromTo(q('.s11-ripple'),
      { scale: 1, opacity: 0.8 },
      { scale: 1.5, opacity: 0, duration: 1.6, ease: 'power1.out', stagger: { each: 0.8, repeat: -1 } });

    // 登場：2行をタイプ → 「次へ」の矢印を出して止まる → 押したら文字を消して左右に分かれる
    const tl = gsap.timeline();
    let t = 0.4;
    q('.s11-line').forEach((line) => {
      line.querySelectorAll('.char').forEach((c) => {
        tl.set(c, { autoAlpha: 1 }, t);
        t += 0.12;
      });
      t += 0.4;
    });
    tl.to(q('.s11-go'), { autoAlpha: 1, duration: 0.5 }, t + 0.3)
      // ここで止まり、矢印が押されたら続きを再生する
      .addPause()
      .to(q('.s11-intro, .s11-go'), { autoAlpha: 0, duration: 0.5 })
      .set(q('.s11-half'), { autoAlpha: 1 })
      // バロメーターがフィーバーしている音を、左右が出るのと同時にループで流す（背景なので小さめ）
      .call(() => {
        const fever = playSound('fever', 0.5);
        if (fever) fever.loop = true;
      })
      .from(q('.s11-right'), { xPercent: 100, duration: 0.8, ease: 'power3.out' })
      // 顔・スイッチ・バロメーターは左右とも同時に、そろってふわっと出す
      .from(q('.s11-face-skater, .s11-face-me, .s11-toggle, .s11-bar'), { autoAlpha: 0, y: 20, duration: 0.6, ease: 'power2.out' }, '-=0.1');

    // モーダル「OFFにできません」（閉じる／カードの外をクリックで閉じる）
    const modal = q('.s11-modal')[0];
    // クリックで作るアニメーションも、シーンを離れたときに元へ戻るよう self.add で登録する
    self.add('openModal', () => gsap.fromTo(modal, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }));
    const closeModal = (e) => {
      if (e.target.closest('.s11-modal-card') && !e.target.closest('.s11-close')) return;
      self.closeModal();
    };
    self.add('closeModal', () => gsap.to(modal, { autoAlpha: 0, duration: 0.2 }));
    modal.addEventListener('click', closeModal);

    // 私のスイッチを ON：目が開き、口が笑い、背景がシアンに。3秒後に自動で次のシーンへ
    let meOn = false;
    self.add('turnOn', () => {
      meOn = true;
      ripple.kill();
      gsap.set(q('.s11-ripple'), { opacity: 0 });
      const sw = q('.s11-toggle-me .s11-switch')[0];
      const on = gsap.timeline()
        // スイッチを ON にした瞬間に Angel
        .call(() => playSound('angel'), null, 0)
        .to(sw.querySelector('.sw-knob'), { attr: { cx: 248.543, fill: '#FF2D55' }, duration: 0.35, ease: 'power2.inOut' }, 0)
        .to(sw.querySelector('.sw-track'), { attr: { fill: '#FFE3E4' }, duration: 0.35 }, 0)
        .to(sw.querySelector('.sw-on'), { attr: { fill: '#FF3B30' }, duration: 0.35 }, 0)
        .to(sw.querySelector('.sw-off'), { attr: { opacity: 0.6 }, duration: 0.35 }, 0)
        .to(q('.s11-right-bg-on'), { opacity: 1, duration: 0.6 }, 0.2)
        // シアンが出きったら下の紺の背景を消す（重ねたままだと、iPhone で左端の半ピクセルが混ざって中央に濃い線が出る）
        .set(q('.s11-right-bg:not(.s11-right-bg-on)'), { autoAlpha: 0 }, 0.8)
        .to(q('.s11-bar-off'), { backgroundColor: '#fff', duration: 0.4 }, 0.2)
        // 一度ぎゅっと目を閉じる（タメ）：まぶたが下まで伸び、下向きのまつ毛も一緒に下がる
        .to(q('.me-lid'), { scaleY: 1.95, transformOrigin: '50% 0%', duration: 0.12, ease: 'power2.in' }, 0.25)
        // まつ毛は閉じたまぶたの縁（白目の下のカーブ）に沿うよう、外側ほど下げる量を小さくする
        .to(q('.me-lashes-down > *'), { y: (i) => [35, 64, 72, 64, 35][i % 5], duration: 0.12, ease: 'power2.in' }, 0.25)
        // パチッと開く：まぶたが上へ引っ込み、瞳が黄色に、まつ毛が上向きに立つ
        .addLabel('open', 0.45)
        .to(q('.me-lid'), { y: -170, scaleY: 1, duration: 0.3, ease: 'power3.out' }, 'open')
        .to(q('.me-lashes-down'), { opacity: 0, duration: 0.1 }, 'open')
        .to(q('.me-iris-yellow'), { opacity: 1, duration: 0.2 }, 'open')
        .fromTo(q('.me-lashes-up'), { opacity: 0, scale: 0.4, transformOrigin: '50% 100%' }, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(3)' }, 'open+=0.05')
        .fromTo(q('.me-eye'), { scale: 1 }, { scale: 1.08, transformOrigin: '50% 50%', duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.out' }, 'open')
        // 少し遅れて、一文字の口から笑った口へフェードで切り替える
        .to(q('.me-mouth-line'), { opacity: 0, duration: 0.3 }, 'open+=0.15')
        .to(q('.me-grin'), { opacity: 1, duration: 0.3 }, 'open+=0.15')
        // 右のバロメーターは、左と同じ位置（進み具合）から動かして揃える
        .add(() => blueFever.progress(redFever.progress()).play(), 0.6)
        // ON にしてから3秒たったら、NEXT を押さずに自動で次のシーンへ
        .call(() => { location.hash = '12'; }, null, 3);
      return on;
    });

    // 「次へ」の矢印：止めていた登場の続きを再生する
    const goButton = q('.s11-go')[0];
    const release = () => tl.play();
    goButton.addEventListener('click', release);

    const onToggle = (e) => {
      const toggle = e.target.closest('.s11-toggle');
      if (!toggle) return;
      if (toggle.classList.contains('s11-toggle-me') && !meOn) self.turnOn();
      else self.openModal();
    };
    el.addEventListener('click', onToggle);

    // BACK で戻ってきたときは、私のスイッチが ON になった状態から表示する
    if (isBack) {
      tl.progress(1);
      // ON の状態から表示する（Angel は鳴らさず、自動でも進まない）。自分で進めるよう NEXT と BACK を出しておく
      self.turnOn().progress(1, true);
      gsap.set(q('.back, .s11-next'), { autoAlpha: 1 });
      blueFever.progress(redFever.progress()).play();
    }

    // 次へ進むときや BACK のときは、画面が切り替わる前にフィーバーの音を消しておく
    const quietFever = (e) => {
      if (e.target.closest('.next, .back')) stopSound('fever', 0.5);
    };
    el.addEventListener('pointerdown', quietFever);

    return () => {
      el.removeEventListener('click', onToggle);
      modal.removeEventListener('click', closeModal);
      goButton.removeEventListener('click', release);
      el.removeEventListener('pointerdown', quietFever);
      stopSound('fever');
    };
  },

  // スケボーがやってくる（12）
  12(el, self, step, isBack) {
    const q = gsap.utils.selector(el);
    const board = q('.s12-board')[0];

    const tl = gsap.timeline()
      // 転がってくる音：素材のいちばん大きい部分（1.0秒目）から鳴らし、0.2秒でフェードイン
      .call(() => {
        playSound('skate', 0, false, 1.0);
        fadeSound('skate', 1, 0.2);
      }, null, 0.3)
      // 止まる 0.6 秒前からフェードアウトして、止まった瞬間に消す
      .call(() => stopSound('skate', 0.6), null, 2.3)
      // 左からゆっくり流れてきて、自然に減速して止まる
      .from(board, { x: -(innerWidth + board.getBoundingClientRect().width), duration: 2.6, ease: 'power2.out' }, 0.3)
      // 「乗る」→ BACK
      .fromTo(q('.s12-ride'), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(1.8)', clearProps: 'transform,translate,rotate,scale' }, '-=0.1')
      .to(q('.back'), { autoAlpha: 1, duration: 0.6 }, '+=0.4');

    // BACK で戻ってきたときは、最後の状態から表示する（途中の音は鳴らさない）
    if (isBack) tl.progress(1, true);

    return () => stopSound('skate');
  },

  // 壁の上を走る2人と問い（13）
  13(el, self, step, isBack) {
    const q = gsap.utils.selector(el);

    // 2人の髪をなびかせる／ストライプを流す（ずっとループ）
    const waveHair = (hair, shape2, shape3) => gsap.timeline({ repeat: -1, yoyo: true, defaults: { duration: 0.8, ease: 'sine.inOut' } })
      .to(hair, { morphSVG: { shape: shape2, shapeIndex: 0 } })
      .to(hair, { morphSVG: { shape: shape3, shapeIndex: 0 } });
    waveHair(q('#s13-hair')[0], q('#s13-hair-2')[0], q('#s13-hair-3')[0]);
    waveHair(q('#s13-me-hair')[0], q('#s13-me-hair-2')[0], q('#s13-me-hair-3')[0]);
    gsap.to(q('.s13-hair-stripe'), { x: -171 * Math.SQRT2, duration: 1, ease: 'none', repeat: -1 });
    gsap.to(q('.s13-me-hair-stripe'), { x: -60 * Math.SQRT2, duration: 0.6, ease: 'none', repeat: -1 });

    // 空を流れる効果線（シーン2〜6と同じ）
    const lines = q('.s13-lines')[0];
    if (!lines.children.length) {
      for (let i = 0; i < 7; i++) {
        const len = gsap.utils.random(120, 280, 10);
        const short = gsap.utils.random(24, 48, 4);
        lines.insertAdjacentHTML('beforeend',
          `<div class="speed-line"><i style="--len:${len}"></i><i style="--len:${short}"></i><i style="--len:4"></i></div>`);
      }
    }
    const skyHeight = () => q('.s13-wall')[0].getBoundingClientRect().top;
    gsap.utils.toArray(lines.children).forEach((line) => {
      gsap.fromTo(line,
        { x: () => innerWidth, y: () => gsap.utils.random(0.08, 0.92) * skyHeight() },
        {
          x: () => -line.offsetWidth,
          duration: gsap.utils.random(1, 1.8),
          ease: 'none',
          repeat: -1,
          repeatRefresh: true,
          repeatDelay: gsap.utils.random(0.2, 1.5),
          delay: gsap.utils.random(0, 2),
        });
    });

    // エンディング曲の導入（低音が入る 9.85 秒まで）は空の色一色。低音が入ったら覆いを消して2人を見せる
    const INTRO = 9.85;
    // 約5秒見せてから、壁の部分にメッセージボックス → BACK（2人が見えるよう暗くはしない）
    const tl = gsap.timeline()
      .to(q('.s13-cover'), { autoAlpha: 0, duration: 1, ease: 'power1.inOut' }, INTRO)
      .fromTo(q('.s13-card'), { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'power2.out' }, INTRO + 6.1)
      .to(q('.back'), { autoAlpha: 1, duration: 0.6 }, '+=0.4');

    // 「血眼な努力」→「それも大事だけれども」／「戻る」→ 質問に戻す（中身だけをクロスフェード）
    self.add('swap', (from, to) => gsap.timeline()
      .to(q(from), { autoAlpha: 0, duration: 0.2 })
      .fromTo(q(to), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }));
    const onClick = (e) => {
      if (e.target.closest('.s13-effort')) self.swap('.s13-q', '.s13-a');
      if (e.target.closest('.s13-return')) self.swap('.s13-a', '.s13-q');
    };
    el.addEventListener('click', onClick);

    // BACK で戻ってきたときは、最後の状態から表示する
    if (isBack) tl.progress(1);

    return () => el.removeEventListener('click', onClick);
  },

  // ポップな狂気を解放しますか？（14）
  14(el, self, step, isBack) {
    const q = gsap.utils.selector(el);

    // 2人の髪のストライプを流す（ずっとループ）
    gsap.to(q('.s14-sk-hair-stripe'), { x: -75 * Math.SQRT2, duration: 1, ease: 'none', repeat: -1 });
    gsap.to(q('.s14-me-hair-stripe'), { x: -69 * Math.SQRT2, duration: 1, ease: 'none', repeat: -1 });

    // 下から上がってきて、少し行き過ぎて戻る／吹き出しはポンと出る
    const rise = { y: innerHeight * 0.6, duration: 0.8, ease: 'back.out(1.4)' };
    const pop = { scale: 0, duration: 0.3, ease: 'back.out(2.5)', transformOrigin: '50% 100%' };

    const tl = gsap.timeline()
      // 画面の切り替え（フェード 0.6秒）が終わって、ひと呼吸おいてから
      .to(q('.s14-title'), { autoAlpha: 1, duration: 1.2, ease: 'sine.inOut' }, 1.2)
      .from(q('.s14-skater'), rise, '+=0.3')
      // キャラが上がってくるときに、シーン5で目が出るときと同じ音（2人とも）
      .call(() => playSound('eye-open', 1.8, true), null, '<')
      .set(q('.s14-bubble-l'), { autoAlpha: 1 })
      .from(q('.s14-bubble-l'), pop)
      .from(q('.s14-me'), rise, '+=0.3')
      .call(() => playSound('eye-open', 1.8, true), null, '<')
      .set(q('.s14-bubble-r'), { autoAlpha: 1 })
      .from(q('.s14-bubble-r'), pop)
      .fromTo(q('.s14-yes'), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(1.8)', clearProps: 'transform,translate,rotate,scale' }, '+=0.4')
      .to(q('.back'), { autoAlpha: 1, duration: 0.6 }, '+=0.4');

    // BACK で戻ってきたときは、最後の状態から表示する（途中の音は鳴らさない）
    if (isBack) tl.progress(1, true);
  },

  // 君の狂気は何色だい？（15）
  15(el, self, step, isBack) {
    const q = gsap.utils.selector(el);

    // タイプライター用に、2行のテキストを1文字ずつ span に分ける（初回だけ）
    q('.s15-line').forEach((line) => {
      if (!line.querySelector('.char')) {
        line.innerHTML = [...line.textContent.trim()].map((c) => `<span class="char">${c}</span>`).join('');
      }
    });

    const tl = gsap.timeline()
      // 鏡が上から降りてくる
      .from(q('.s15-mirror'), { y: -innerHeight * 1.2, duration: 1.4, ease: 'power3.out' }, 0.3)
      // 止まったら、ガラスの上を光の帯がスッと横切る
      .fromTo(q('.s15-glint'), { x: -600 }, { x: 2200, duration: 2, ease: 'sine.inOut' }, '+=0.2')
      // 帯がガラスの中心を通る（動き出して約0.9秒）ところに、音のいちばん大きいところ（鳴り始めて約0.3秒）を合わせる
      .call(() => playSound('kiran'), null, '<0.6');
    // 問いかけを1文字ずつ（1文字0.12秒、行の間は0.4秒）
    let t = tl.duration() + 0.4;
    q('.s15-line').forEach((line) => {
      line.querySelectorAll('.char').forEach((c) => {
        tl.set(c, { autoAlpha: 1 }, t);
        t += 0.12;
      });
      t += 0.4;
    });
    // BACK と TOPへ を同時に
    tl.to(q('.back, .s15-top'), { autoAlpha: 1, duration: 0.6 }, t + 0.4);

    // BACK で戻ってきたときは、最後の状態から表示する（途中の音は鳴らさない）
    if (isBack) tl.progress(1, true);

    return () => stopSound('kiran');
  },
};
