local state = {
    isLive        = false,
    djSource      = 0,
    boothCoords   = Config.defaultBoothCoords,
    boothHeading  = Config.defaultBoothHeading,
    deckA = { url = '', isPlaying = false, startServerTime = 0.0, accumulated = 0.0, volume = 1.0, pitch = 1.0, eq = { hi = 0.0, mid = 0.0, lo = 0.0 } },
    deckB = { url = '', isPlaying = false, startServerTime = 0.0, accumulated = 0.0, volume = 1.0, pitch = 1.0, eq = { hi = 0.0, mid = 0.0, lo = 0.0 } },
    crossfade  = 0.5,
    bpm        = 128,
}

-- Helpers
local function deckPayload(deck)
    local elapsed = deck.accumulated or 0.0
    if deck.isPlaying and deck.startServerTime > 0 then
        elapsed = elapsed + (GetGameTimer() / 1000.0 - deck.startServerTime)
    end
    if elapsed < 0 then elapsed = 0 end
    return {
        url       = deck.url,
        isPlaying = deck.isPlaying,
        elapsed   = elapsed,
        volume    = deck.volume,
        pitch     = deck.pitch,
        eq        = deck.eq,
    }
end

local function broadcastSync()
    TriggerClientEvent('rave:client:syncTrack', -1, {
        deckA       = deckPayload(state.deckA),
        deckB       = deckPayload(state.deckB),
        crossfade   = state.crossfade,
        boothCoords = state.boothCoords,
        isLive      = state.isLive,
        bpm         = state.bpm,
    })
end

-- Role claim callbacks
lib.callback.register('rave:server:claimDJ', function(source)
    if state.djSource ~= 0 and state.djSource ~= source then
        return false, 'DJ booth is already occupied.'
    end
    state.djSource = source
    return true, nil
end)

lib.callback.register('rave:server:getState', function(source)
    return {
        deckA       = state.deckA,
        deckB       = state.deckB,
        crossfade   = state.crossfade,
        boothCoords = state.boothCoords,
        isLive      = state.isLive,
        bpm         = state.bpm,
    }
end)

-- DJ events
RegisterNetEvent('rave:server:loadTrack', function(deckId, url)
    local src = source --[[@as integer]]
    if src ~= state.djSource then return end
    local deck = deckId == 'A' and state.deckA or state.deckB
    deck.url             = url
    deck.isPlaying       = false
    deck.startServerTime = 0.0
    deck.accumulated     = 0.0
    broadcastSync()
end)

RegisterNetEvent('rave:server:deckPlay', function(deckId, isPlaying)
    local src = source
    if src ~= state.djSource then return end
    local deck = deckId == 'A' and state.deckA or state.deckB
    local now = GetGameTimer() / 1000.0
    if isPlaying and not deck.isPlaying then
        deck.startServerTime = now
    elseif not isPlaying and deck.isPlaying and deck.startServerTime > 0 then
        deck.accumulated     = deck.accumulated + (now - deck.startServerTime)
        deck.startServerTime = 0.0
    end
    deck.isPlaying = isPlaying
    if not state.isLive then
        state.isLive = true
    end
    broadcastSync()
end)

RegisterNetEvent('rave:server:setCrossfade', function(value)
    local src = source
    if src ~= state.djSource then return end
    state.crossfade = math.max(0.0, math.min(1.0, value))
    broadcastSync()
end)

RegisterNetEvent('rave:server:setVolume', function(deckId, volume)
    local src = source
    if src ~= state.djSource then return end
    local deck = deckId == 'A' and state.deckA or state.deckB
    deck.volume = math.max(0.0, math.min(1.0, volume))
    broadcastSync()
end)

RegisterNetEvent('rave:server:setPitch', function(deckId, pitch)
    local src = source
    if src ~= state.djSource then return end
    local deck = deckId == 'A' and state.deckA or state.deckB
    deck.pitch = math.max(0.5, math.min(2.0, pitch))
    broadcastSync()
end)

RegisterNetEvent('rave:server:setEQ', function(deckId, band, gainDb)
    local src = source
    if src ~= state.djSource then return end
    if band ~= 'hi' and band ~= 'mid' and band ~= 'lo' then return end
    local deck = deckId == 'A' and state.deckA or state.deckB
    deck.eq[band] = math.max(-24.0, math.min(24.0, tonumber(gainDb) or 0.0))
    broadcastSync()
end)

-- Leave / cleanup
RegisterNetEvent('rave:server:leave', function(role)
    local src = source
    if role == 'dj' and src == state.djSource then
        state.djSource   = 0
        state.isLive     = false
        state.deckA      = { url = '', isPlaying = false, startServerTime = 0.0, accumulated = 0.0, volume = 1.0, pitch = 1.0, eq = { hi = 0.0, mid = 0.0, lo = 0.0 } }
        state.deckB      = { url = '', isPlaying = false, startServerTime = 0.0, accumulated = 0.0, volume = 1.0, pitch = 1.0, eq = { hi = 0.0, mid = 0.0, lo = 0.0 } }
        TriggerClientEvent('rave:client:djLeft', -1)
    end
end)

-- Set booth coords (no permission required)
RegisterNetEvent('rave:server:setBoothCoords', function(coords, heading)
    state.boothCoords  = coords
    state.boothHeading = heading
    local src = source --[[@as integer]]
    TriggerClientEvent('ox_lib:notify', src, { type = 'success', description = 'Booth position set.' })
    TriggerClientEvent('rave:client:boothMoved', -1, coords, heading)
end)

lib.callback.register('rave:server:getBoothCoords', function(_)
    return state.boothCoords, state.boothHeading
end)

-- Sync heartbeat
CreateThread(function()
    while true do
        Wait(Config.syncInterval)
        if state.isLive then
            broadcastSync()
        end
    end
end)

-- Clean up if DJ disconnects
AddEventHandler('playerDropped', function()
    local src = source
    if src == state.djSource then
        state.djSource = 0
        state.isLive   = false
        state.deckA    = { url = '', isPlaying = false, startServerTime = 0.0, volume = 1.0, pitch = 1.0 }
        state.deckB    = { url = '', isPlaying = false, startServerTime = 0.0, volume = 1.0, pitch = 1.0 }
        TriggerClientEvent('rave:client:djLeft', -1)
    end
end)
