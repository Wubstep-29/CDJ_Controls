-- DJ: load a track URL onto a deck
RegisterNUICallback('dj:loadTrack', function(data, cb)
    TriggerServerEvent('rave:server:loadTrack', data.deckId, data.url)
    cb('ok')
end)

-- DJ: play or pause a deck
RegisterNUICallback('dj:play', function(data, cb)
    TriggerServerEvent('rave:server:deckPlay', data.deckId, data.isPlaying)
    cb('ok')
end)

-- DJ: crossfader position (0.0–1.0)
RegisterNUICallback('dj:crossfade', function(data, cb)
    TriggerServerEvent('rave:server:setCrossfade', tonumber(data.value))
    cb('ok')
end)

-- DJ: channel volume fader
RegisterNUICallback('dj:volume', function(data, cb)
    TriggerServerEvent('rave:server:setVolume', data.deckId, tonumber(data.value))
    cb('ok')
end)

-- DJ: pitch/tempo control
RegisterNUICallback('dj:pitch', function(data, cb)
    TriggerServerEvent('rave:server:setPitch', data.deckId, tonumber(data.value))
    cb('ok')
end)

-- DJ: EQ band gain (band = 'hi'|'mid'|'lo', gain in dB)
RegisterNUICallback('dj:eq', function(data, cb)
    TriggerServerEvent('rave:server:setEQ', data.deckId, data.band, tonumber(data.gain))
    cb('ok')
end)

-- Close UI (just hides — does NOT release the DJ role)
RegisterNUICallback('closeUI', function(data, cb)
    SetNuiFocus(false, false)
    cb('ok')
end)

-- Escape key passthrough from NUI
RegisterNUICallback('escapeUI', function(data, cb)
    SetNuiFocus(false, false)
    cb('ok')
end)
