let identifierCounterVariable = 0;

class SoundPlayer {
    static yPlayer = null;
    youtubePlayerReady = false;

    constructor() {
        this.url = "test";
        this.name = "";
        this.dynamic = false;
        this.distance = 10;
        this.volume = 1.0;
        this.pos = [ 0.0, 0.0, 0.0 ];
        this.max_volume = -1.0;
        this.div_id = "myAudio_" + identifierCounterVariable++;
        this.loop = false;
        this.isYoutube = false;
        this.load = false;
        this.isMuted_ = false;
        this.audioPlayer = null;
        this.pitch = 1.0;
        this.eqGains = { hi: 0, mid: 0, lo: 0 };
        this.eqNodes = null;
    }

    setYoutubePlayerReady(result) {
        this.youtubePlayerReady = result;
    }

    isYoutubePlayerReady() {
        return this.youtubePlayerReady;
    }

    isAudioYoutubePlayer() {
        return this.isYoutube;
    }

    getDistance() {
        return this.distance;
    }

    getLocation() {
        return this.pos;
    }

    getVolume() {
        return this.volume;
    }

    getMaxVolume() {
        return this.max_volume;
    }

    getUrlSound() {
        return this.url;
    }

    isDynamic() {
        return this.dynamic;
    }

    getDivId() {
        return this.div_id;
    }

    isLoop() {
        return this.loop;
    }

    getName() {
        return this.name;
    }

    loaded() {
        return this.load;
    }

    getAudioPlayer() {
        return this.audioPlayer;
    }

    getYoutubePlayer() {
        return this.yPlayer;
    }

    getAudioCurrentTime() {
        if (this.isAudioYoutubePlayer()) {
            return this.getYoutubePlayer().getDuration();
        }
        return this.getAudioPlayer()._duration;
    }

    setLoaded(result) {
        this.load = result;
    }

    setName(result) {
        this.name = result;
    }

    setDistance(result) {
        this.distance = result;
    }

    setDynamic(result) {
        this.dynamic = result;
    }

    setLocation(x_, y_, z_) {
        this.pos = [ x_, y_, z_ ];
    }


    setSoundUrl(result) {
        this.url = sanitizeURL(result);
    }

    setLoop(result) {
        if (!this.isAudioYoutubePlayer()) {
            if (this.audioPlayer != null) {
                this.audioPlayer.loop(result);
            }
        }
        this.loop = result;
    }


    setMaxVolume(result) {
        this.max_volume = result;
    }

    setVolume(result) {
        this.volume = result;
        if (this.max_volume == -1) this.max_volume = result;
        if (this.max_volume > (this.volume - 0.01)) this.volume = this.max_volume;

        let volume = result;
        if (this.isDynamic() && (this.isMuted() || IsAllMuted)) volume = 0;

        if (this.isAudioYoutubePlayer() && this.yPlayer && this.isYoutubePlayerReady()) {
            this.yPlayer.setVolume(volume * 100);
        } else if (this.audioPlayer) {
            this.audioPlayer.volume(volume);
        }
    }

    create() {
        const link = getYoutubeUrlId(this.getUrlSound());

        if (link === "") {
            this.isYoutube = false;

            this.audioPlayer = new Howl({
                src: [ this.getUrlSound() ],
                loop: false,
                html5: true,
                autoplay: false,
                volume: 0.00,
                format: [ 'mp3' ],
                onload: () => {
                    this._setupEQ();
                    $.post('https://xsound/events', JSON.stringify({ type: "onLoading", id: this.getName() }));
                },
                onend: () => {
                    ended(this.getName());
                },
                onplay: () => {
                    isReady(this.getName());
                },
            });
            $("#" + this.div_id).remove();
        } else {
            this.isYoutube = true;
            this.setYoutubePlayerReady(false);
            $("#" + this.div_id).remove();
            $("body").append("<div id='" + this.div_id + "'></div>");
            this.yPlayer = new YT.Player(this.div_id, {

                startSeconds: Number,

                videoId: link,
                origin: window.location.href,
                enablejsapi: 1,
                width: "0",
                height: "0",
                playerVars: {
                    autoplay: 0,
                    controls: 0,
                    quality: 'auto',
                },
                events: {
                    'onReady': (event) => {
                        event.target.unMute();
                        event.target.setVolume(0);
                        event.target.playVideo();
                        isReady(this.getName());
                        $.post('https://xsound/events', JSON.stringify({ type: "onLoading", id: this.getName() }));
                    },
                    'onStateChange': (event) => {
                        if (event.data == YT.PlayerState.ENDED) {
                            ended(this.getName());
                        }
                    }
                }
            });
        }
    }

    destroyYoutubeApi() {
        if (this.yPlayer) {
            if (typeof this.yPlayer.stopVideo === "function" && typeof this.yPlayer.destroy === "function") {
                this.yPlayer.stopVideo();
                this.yPlayer.destroy();
                this.youtubePlayerReady = false;
                this.yPlayer = null;
            }
        }
    }

    delete() {
        this._teardownEQ();
        if (this.audioPlayer != null) {
            this.audioPlayer.pause();
            this.audioPlayer.stop();
            this.audioPlayer.unload();
        }
        this.audioPlayer = null;
        $("#" + this.div_id).remove();
    }

    // Build a Web Audio filter chain on top of Howler's HTMLAudioElement so we
    // can apply EQ. YouTube audio is locked inside its iframe and cannot be
    // routed through Web Audio — setEQ is silently no-op there.
    _setupEQ() {
        if (this.isYoutube || !this.audioPlayer || this.eqNodes) return;
        if (typeof Howler === 'undefined' || !Howler.ctx) return;
        const ctx = Howler.ctx;
        if (!ctx || ctx.state === 'closed') return;
        const sounds = this.audioPlayer._sounds;
        if (!sounds || !sounds.length) return;
        const node = sounds[0]._node;
        if (!node || !(node instanceof HTMLAudioElement)) return;

        try {
            // createMediaElementSource can only be called once per element.
            // Howler reuses audio elements from its pool when tracks change,
            // so cache the source on the element and reuse it on subsequent
            // loads. Disconnecting the old chain in _teardownEQ leaves this
            // source unbound and ready to wire into fresh filters.
            let src = node._xsoundSrc;
            if (!src) {
                src = ctx.createMediaElementSource(node);
                node._xsoundSrc = src;
            } else {
                try { src.disconnect(); } catch (e) {}
            }
            const hi  = ctx.createBiquadFilter();
            hi.type = 'highshelf'; hi.frequency.value = 10000;
            const mid = ctx.createBiquadFilter();
            mid.type = 'peaking';  mid.frequency.value = 1000; mid.Q.value = 0.7;
            const lo  = ctx.createBiquadFilter();
            lo.type = 'lowshelf';  lo.frequency.value = 200;
            hi.gain.value  = this.eqGains.hi;
            mid.gain.value = this.eqGains.mid;
            lo.gain.value  = this.eqGains.lo;
            src.connect(lo).connect(mid).connect(hi).connect(ctx.destination);
            this.eqNodes = { src, hi, mid, lo };

            // Chromium's autoplay policy will auto-suspend the AudioContext
            // after ~30s of no user gesture, which silences the entire EQ
            // chain. Silencing/resuming mid-stream is not recoverable without
            // an audible click. Prevent suspension by keeping a silent
            // ConstantSourceNode continuously feeding the destination — the
            // context stays "active" and never enters the suspended state.
            if (!ctx._xsoundKeepalive) {
                try {
                    const keep = ctx.createConstantSource
                        ? ctx.createConstantSource()
                        : ctx.createOscillator();
                    if (keep.frequency) keep.frequency.value = 0;
                    const keepGain = ctx.createGain();
                    keepGain.gain.value = 0;
                    keep.connect(keepGain).connect(ctx.destination);
                    keep.start();
                    ctx._xsoundKeepalive = true;
                } catch (e) {}
            }
            // Last-resort safety net: if the context suspends anyway, resume
            // silently. No fade — fade is audible as a dip; the keepalive
            // above should prevent this path from ever being needed.
            if (!ctx._xsoundAutoResume) {
                ctx._xsoundAutoResume = true;
                const poke = () => {
                    if (ctx.state !== 'running') ctx.resume().catch(() => {});
                };
                ctx.addEventListener('statechange', poke);
                setInterval(poke, 500);
            }
        } catch (e) {
            console.warn('xsound: setupEQ failed, audio will play without EQ', e);
        }
    }

    _teardownEQ() {
        if (!this.eqNodes) return;
        try {
            this.eqNodes.src.disconnect();
            this.eqNodes.lo.disconnect();
            this.eqNodes.mid.disconnect();
            this.eqNodes.hi.disconnect();
        } catch (e) {}
        this.eqNodes = null;
    }

    setPitch(rate) {
        this.pitch = rate;
        if (this.isAudioYoutubePlayer()) {
            if (this.isYoutubePlayerReady() && this.yPlayer) {
                try { this.yPlayer.setPlaybackRate(rate); } catch (e) {}
            }
            return;
        }
        if (!this.audioPlayer) return;
        // Howler 2.1.1 has quirks with rate() in html5 mode — also set the
        // HTMLAudioElement's playbackRate directly so the change actually lands.
        try { this.audioPlayer.rate(rate); } catch (e) {}
        const sounds = this.audioPlayer._sounds;
        if (sounds && sounds.length) {
            for (const s of sounds) {
                if (s && s._node && 'playbackRate' in s._node) {
                    try { s._node.playbackRate = rate; } catch (e) {}
                }
            }
        }
        console.log('[xsound] setPitch', this.getName(), '=>', rate);
    }

    setEQ(band, gainDb) {
        if (band !== 'hi' && band !== 'mid' && band !== 'lo') return;
        this.eqGains[band] = gainDb;
        if (this.eqNodes && this.eqNodes[band]) {
            this.eqNodes[band].gain.value = gainDb;
        }
    }

    updateVolume(dd, maxd) {
        const d_max = maxd;
        const d_now = dd;
        let vol = 0;
        let distance = (d_now / d_max);
        if (distance < 1) {
            distance = distance * 100;
            const far_away = 100 - distance;
            vol = (this.max_volume / 100) * far_away;
            this.setVolume(vol);
            this.isMuted_ = false;
        } else {
            this.setVolume(0);
            this.isMuted_ = true;
        }
    }

    play() {
        if (!this.isAudioYoutubePlayer()) {
            if (this.audioPlayer != null) {
                this.audioPlayer.play();
            }
        } else {
            if (this.isYoutubePlayerReady()) {
                this.yPlayer.playVideo();
            }
        }
    }

    pause() {
        if (!this.isAudioYoutubePlayer()) {
            if (this.audioPlayer != null) this.audioPlayer.pause();
        } else {
            if (this.isYoutubePlayerReady()) this.yPlayer.pauseVideo();
        }
    }

    resume() {
        if (!this.isAudioYoutubePlayer()) {
            if (this.audioPlayer != null) this.audioPlayer.play();
        } else {
            if (this.isYoutubePlayerReady()) this.yPlayer.playVideo();
        }
    }

    isMuted() {
        return this.isMuted_;
    }

    mute() {
        this.isMuted_ = true;
        this.setVolume(0)
    }

    unmute() {
        this.isMuted_ = false;
        this.setVolume(this.getVolume())
    }

    unmuteSilent() {
        this.isMuted_ = false;
    }

    setTimeStamp(time) {
        if (!this.isAudioYoutubePlayer()) {
            this.audioPlayer.seek(time);
        } else {
            this.yPlayer.seekTo(time);
        }
    }

    isPlaying() {
        if (this.isAudioYoutubePlayer()) return this.isYoutubePlayerReady() && this.yPlayer.getPlayerState() == 1;
        else return this.audioPlayer != null && this.audioPlayer.playing();
    }
}
