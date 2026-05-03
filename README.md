# 🎧 rave_dj

A chill two deck DJ booth for FiveM. It uses positional audio, so anyone hanging out near the booth can hear what you're spinning. It's built on top of xsound and designed for actually mixing tracks, not just pressing play.

## What you need

Before you fire this up, make sure you have these started in your server:

* qbx_core
* ox_lib
* ox_target
* xsound (the patched version, see below)

Just drop the folder into `resources/[rave]/rave_dj` and add `ensure rave_dj` to your server.cfg.

### A quick note on xsound

This deck uses custom `setEQ` and `setPitch` exports that the standard version of xsound doesn't have. I've included a patched copy of xsound in the repo. Please use that one! If you stay on the stock version, the audio will still work, but the EQ knobs and pitch sliders won't actually do anything to the sound.

## How to use it

### Commands and Interaction

`/djbooth` puts you into placement mode. Just walk to where you want the booth and click to confirm. The props will spawn right there. If you want to move it later, just run the command again.

`/dj` claims the DJ role and opens the UI. You get a standard two channel mixer with EQ, gain, pitch, and a crossfader. Load a track on each side and you're ready to go.

`/djleave` lets go of the decks so someone else can spin.

**Targeting:** If you don't like commands, you can just walk up to the booth and use ox_target on it.

### Loading up tracks

The decks need a direct audio URL. Anything like a Catbox link or a Dropbox direct download link will work perfectly as long as it's an mp3 or m4a.

YouTube links won't play directly because they block audio playback outside of their own site. You have two ways to handle this:

#### The catbox tool (Easy)

I put a script in `tools/yt-to-catbox.bat`. Double click it, paste your YouTube link, and hit enter. It downloads the audio, uploads it to Catbox for you, and copies the new link straight to your clipboard.

If you want the upload tied to your own Catbox account, run the powershell version:

```powershell
.\tools\yt-to-catbox.ps1 "URL" -UserHash yourhash
```

Just remember that Catbox caps uploads at 200 MB.

#### The resolver (Optional)

In the `resolver` folder, there is a small node server. Run `resolver/start.bat` and leave the window open. While that is running, the deck will accept YouTube links directly without you needing to convert them first.

## Range and config

By default, the audio carries for about 80 meters. If you want it to be louder across the map or more quiet for a small club, change `Config.range` in `config/shared.lua`.

Setting up the booth is limited to people with the `rave.admin` permission, but you can change that in the config too.
