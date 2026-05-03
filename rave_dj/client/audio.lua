local activeUrls    = {}   -- soundId -> currently loaded URL (nil if none)
local isCreated     = {}   -- soundId -> true once xsound has been told to PlayUrlPos
local isPaused      = {}   -- soundId -> true when we've paused it (so we know to Resume vs no-op)
local seekedOnPlay  = {}   -- soundId -> bool, true after first sync-seek on this play
local lastPitch     = {}   -- soundId -> last pitch rate sent to xsound
local lastEQ        = {}   -- soundId -> { hi, mid, lo } last eq gains sent to xsound

local function computeVolume(deckState, crossfade, deckId)
    local cf = deckId == 'A' and (1.0 - crossfade) or crossfade
    return math.max(0.0, math.min(1.0, deckState.volume * cf))
end

local function teardown(soundId)
    if isCreated[soundId] then
        exports['xsound']:Destroy(soundId)
    end
    activeUrls[soundId]   = nil
    isCreated[soundId]    = false
    isPaused[soundId]     = false
    seekedOnPlay[soundId] = false
    lastPitch[soundId]    = nil
    lastEQ[soundId]       = nil
end

local function applyPitchAndEQ(soundId, deckState)
    local pitch = deckState.pitch or 1.0
    if lastPitch[soundId] ~= pitch then
        pcall(exports['xsound'].setPitch, exports['xsound'], soundId, pitch)
        lastPitch[soundId] = pitch
    end
    local eq = deckState.eq
    if not eq then return end
    local prev = lastEQ[soundId] or { hi = 0.0, mid = 0.0, lo = 0.0 }
    for _, band in ipairs({ 'hi', 'mid', 'lo' }) do
        local g = eq[band] or 0.0
        if prev[band] ~= g then
            pcall(exports['xsound'].setEQ, exports['xsound'], soundId, band, g)
            prev[band] = g
        end
    end
    lastEQ[soundId] = prev
end

local function toVec3(p)
    if not p then return vector3(0.0, 0.0, 0.0) end
    if type(p) == 'vector3' then return p end
    return vector3(p.x or 0.0, p.y or 0.0, p.z or 0.0)
end

local function syncDeck(deckId, deckState, crossfade, boothCoords)
    local soundId = deckId == 'A' and Config.soundIdA or Config.soundIdB
    local vol     = computeVolume(deckState, crossfade, deckId)
    boothCoords   = toVec3(boothCoords)

    -- Empty URL — tear down
    if deckState.url == '' then
        teardown(soundId)
        return
    end

    -- URL changed (new track loaded) — destroy old, remember URL, wait for play
    if activeUrls[soundId] ~= deckState.url then
        teardown(soundId)
        activeUrls[soundId] = deckState.url
        -- Do NOT create the xsound instance yet; xsound always autoplays on
        -- PlayUrlPos and its Pause-while-loading is unreliable for YouTube.
        -- We create it on the first isPlaying=true below.
    end

    if deckState.isPlaying then
        if not isCreated[soundId] then
            -- First time playing this track: create and start it
            exports['xsound']:PlayUrlPos(soundId, deckState.url, vol, boothCoords, false)
            exports['xsound']:Distance(soundId, Config.range)
            isCreated[soundId] = true
            isPaused[soundId]  = false
            -- Seek for late joiners if the track has been playing a while server-side
            if deckState.elapsed and deckState.elapsed > 1 then
                exports['xsound']:setTimeStamp(soundId, deckState.elapsed)
            end
            seekedOnPlay[soundId] = true
        else
            -- Update both max_volume (used by xsound's distance loop as ceiling)
            -- and current volume, otherwise the distance loop re-overrides us.
            exports['xsound']:setVolumeMax(soundId, vol)
            exports['xsound']:setVolume(soundId, vol)
            if isPaused[soundId] then
                exports['xsound']:Resume(soundId)
                isPaused[soundId] = false
            end
        end
        applyPitchAndEQ(soundId, deckState)
    else
        if isCreated[soundId] and not isPaused[soundId] then
            exports['xsound']:Pause(soundId)
            isPaused[soundId]     = true
            seekedOnPlay[soundId] = false
        end
    end
end

-- Main sync event from server heartbeat
RegisterNetEvent('rave:client:syncTrack', function(data)
    if not data then return end
    local coords = data.boothCoords or Config.defaultBoothCoords
    syncDeck('A', data.deckA, data.crossfade, coords)
    syncDeck('B', data.deckB, data.crossfade, coords)

    -- Forward BPM to NUI for deck BPM display + waveform beat-pulse
    if data.bpm then
        SendNUIMessage({ action = 'setBPM', bpm = data.bpm })
    end
end)

-- Stop all sounds when DJ leaves
RegisterNetEvent('rave:client:djLeft', function()
    teardown(Config.soundIdA)
    teardown(Config.soundIdB)
end)

-- Cleanup
AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    pcall(function() exports['xsound']:Destroy(Config.soundIdA) end)
    pcall(function() exports['xsound']:Destroy(Config.soundIdB) end)
end)
