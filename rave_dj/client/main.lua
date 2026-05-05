local spawnedProps = {}
local deckEntity   = nil   -- the entity ox_target is bound to
local currentRole  = nil   -- 'dj' | nil
local boothCoords  = Config.defaultBoothCoords
local boothHeading = Config.defaultBoothHeading
local isPlacing    = false

local function boothPlaced()
    return boothCoords and not (boothCoords.x == 0.0 and boothCoords.y == 0.0 and boothCoords.z == 0.0)
end

local function openDJUI()
    SendNUIMessage({ action = 'openRole', role = 'dj' })
    SetNuiFocus(true, true)
end

local function closeUI()
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

local function loadModel(hash)
    if not IsModelValid(hash) then return false end
    if HasModelLoaded(hash) then return true end
    RequestModel(hash)
    local timeout = 0
    while not HasModelLoaded(hash) and timeout < 100 do
        Wait(50)
        timeout = timeout + 1
    end
    return HasModelLoaded(hash)
end

-- Rotate a 2D offset by heading (degrees). +Y is forward.
local function rotateOffset(ox, oy, headingDeg)
    local r = math.rad(headingDeg)
    local c, s = math.cos(r), math.sin(r)
    return ox * c - oy * s, ox * s + oy * c
end

local function useDJBooth()
    if currentRole == 'dj' then
        openDJUI()
        return
    end
    if currentRole then
        lib.notify({ description = 'You already have a role.', type = 'error' })
        return
    end
    local ok, reason = lib.callback.await('rave:server:claimDJ', false)
    if not ok then
        lib.notify({ description = reason or 'Booth is occupied.', type = 'error' })
        return
    end
    currentRole = 'dj'
    openDJUI()
end

local function addDeckTarget(entity)
    exports.ox_target:addLocalEntity(entity, {
        {
            name     = 'rave_dj_booth',
            label    = 'Use DJ Booth',
            icon     = 'fa-solid fa-headphones',
            distance = 2.0,
            onSelect = function()
                useDJBooth()
            end,
        },
    })
end

local function spawnBoothProps()
    if #spawnedProps > 0 then return end
    if not boothPlaced() then return end
    for _, prop in ipairs(Config.boothProps) do
        local hash = joaat(prop.model)
        if loadModel(hash) then
            local rx, ry = rotateOffset(prop.offset.x, prop.offset.y, boothHeading)
            local wx = boothCoords.x + rx
            local wy = boothCoords.y + ry
            local wz = boothCoords.z + prop.offset.z
            local obj = CreateObjectNoOffset(hash, wx, wy, wz, false, false, false)
            SetEntityHeading(obj, (boothHeading + prop.heading) % 360.0)
            FreezeEntityPosition(obj, true)
            SetEntityInvincible(obj, true)
            spawnedProps[#spawnedProps + 1] = obj
            if prop.isDeck then
                deckEntity = obj
                addDeckTarget(obj)
            end
            SetModelAsNoLongerNeeded(hash)
        end
    end
end

local function deleteBoothProps()
    for _, obj in ipairs(spawnedProps) do
        if DoesEntityExist(obj) then
            if obj == deckEntity then
                exports.ox_target:removeLocalEntity(obj, 'rave_dj_booth')
            end
            DeleteObject(obj)
        end
    end
    spawnedProps = {}
    deckEntity   = nil
end

-- Find the prop flagged isDeck (used as placement ghost model)
local function getDeckProp()
    for _, p in ipairs(Config.boothProps) do
        if p.isDeck then return p end
    end
    return Config.boothProps[1]
end

local function placementMode()
    if isPlacing then return end
    local deckProp = getDeckProp()
    if not deckProp then return end

    local hash = joaat(deckProp.model)
    if not loadModel(hash) then
        lib.notify({ description = ('Failed to load preview model: %s'):format(deckProp.model), type = 'error' })
        return
    end

    isPlacing = true
    local ped = cache.ped
    local pc  = GetEntityCoords(ped)
    local ghost = CreateObjectNoOffset(hash, pc.x, pc.y, pc.z - 1.0, false, false, false)
    SetEntityAlpha(ghost, 160, false)
    SetEntityCollision(ghost, false, false)
    SetEntityInvincible(ghost, true)
    FreezeEntityPosition(ghost, true)
    SetModelAsNoLongerNeeded(hash)

    local heading = GetEntityHeading(ped)
    local zOffset = 0.0
    local distance = 2.2

    lib.showTextUI('[Enter] Confirm  |  [Backspace] Cancel  |  [Scroll] Rotate  |  [↑/↓] Height', {
        position = 'top-center',
    })

    local result = nil
    while result == nil do
        local pedPos  = GetEntityCoords(ped)
        local pedHead = GetEntityHeading(ped)
        local rad     = math.rad(pedHead)
        local fx      = pedPos.x - math.sin(rad) * distance
        local fy      = pedPos.y + math.cos(rad) * distance
        local ok, gz  = GetGroundZFor_3dCoord(fx, fy, pedPos.z + 2.0, false)
        local baseZ   = ok and gz or (pedPos.z - 1.0)
        SetEntityCoordsNoOffset(ghost, fx, fy, baseZ + zOffset, false, false, false)
        SetEntityHeading(ghost, heading)

        -- Block scroll/arrow from affecting gameplay
        DisableControlAction(0, 14, true)   -- scroll down (weapon next)
        DisableControlAction(0, 15, true)   -- scroll up   (weapon prev)
        DisableControlAction(0, 172, true)  -- arrow up
        DisableControlAction(0, 173, true)  -- arrow down
        DisableControlAction(0, 37, true)   -- tab (weapon wheel)

        if IsDisabledControlJustPressed(0, 15) then
            heading = (heading + 7.5) % 360.0
        elseif IsDisabledControlJustPressed(0, 14) then
            heading = (heading - 7.5) % 360.0
        end
        if IsDisabledControlPressed(0, 172) then
            zOffset = zOffset + 0.02
        elseif IsDisabledControlPressed(0, 173) then
            zOffset = zOffset - 0.02
        end

        if IsControlJustPressed(0, 201) then       -- Enter
            result = 'confirm'
        elseif IsControlJustPressed(0, 202) or IsControlJustPressed(0, 177) then  -- Esc / Backspace
            result = 'cancel'
        end

        Wait(0)
    end

    local finalCoords  = GetEntityCoords(ghost)
    local finalHeading = GetEntityHeading(ghost)
    if DoesEntityExist(ghost) then DeleteObject(ghost) end
    lib.hideTextUI()
    isPlacing = false

    if result == 'confirm' then
        TriggerServerEvent('rave:server:setBoothCoords', finalCoords, finalHeading)
        -- server broadcasts rave:client:boothMoved which respawns props for everyone
    else
        lib.notify({ description = 'Placement cancelled.', type = 'inform' })
    end
end

-- /djbooth — enter placement mode to position the booth in the world
RegisterCommand('djbooth', function()
    placementMode()
end, false)

-- /dj — claim DJ role and open the CDJ UI (fallback; normally opened via ox_target)
RegisterCommand('dj', function()
    if not boothPlaced() then
        lib.notify({ description = 'No DJ booth placed. Use /djbooth to place one.', type = 'error' })
        return
    end
    useDJBooth()
end, false)

-- /djleave — release the DJ role
RegisterCommand('djleave', function()
    if not currentRole then return end
    TriggerServerEvent('rave:server:leave', currentRole)
    currentRole = nil
    closeUI()
end, false)

-- Called from nui.lua when user closes the UI via button
function ReleaseRole()
    if not currentRole then return end
    TriggerServerEvent('rave:server:leave', currentRole)
    currentRole = nil
end

-- Server broadcasts this whenever the booth is (re)placed — respawn props
RegisterNetEvent('rave:client:boothMoved', function(coords, heading)
    boothCoords  = coords
    boothHeading = heading or 0.0
    deleteBoothProps()
    spawnBoothProps()
end)

RegisterNetEvent('rave:client:djLeft', function()
    SendNUIMessage({ action = 'djLeft' })
end)

-- On resource/session start: fetch saved coords and spawn booth if placed
CreateThread(function()
    Wait(500)
    local coords, heading = lib.callback.await('rave:server:getBoothCoords', false)
    if coords then
        boothCoords  = coords
        boothHeading = heading or 0.0
        if boothPlaced() then
            spawnBoothProps()
        end
    end
end)

-- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    deleteBoothProps()
    if isPlacing then lib.hideTextUI() end
    SetNuiFocus(false, false)
end)
