Config = {}

-- Max distance (meters) players can hear the DJ from
Config.range = 80.0

-- Default booth position (overridden at runtime via /djbooth)
-- Set this to your venue location so it persists across restarts
Config.defaultBoothCoords = vector3(0.0, 0.0, 0.0)

-- Heading the booth props face
Config.defaultBoothHeading = 0.0

-- How often (ms) the server re-broadcasts sync heartbeat to correct drift
Config.syncInterval = 5000

-- Props spawned at booth coords. Offsets are relative and rotate with booth heading.
-- x = right/left, y = forward/back, z = up/down
-- Exactly one prop should have isDeck = true — that's where ox_target attaches.
Config.boothProps = {
    { model = 'sf_prop_sf_dj_desk_01a',           offset = vector3( 0.0, 0.0, 0.0), heading = 0.0, isDeck = true },
    { model = 'h4_prop_battle_club_speaker_array', offset = vector3( 2.2, 0.0, 0.0), heading = 0.0 },
    { model = 'h4_prop_battle_club_speaker_array', offset = vector3(-2.2, 0.0, 0.0), heading = 0.0 },
}

-- Ace permission required to use /djbooth (set booth location)
Config.boothPermission = 'rave.admin'

-- Sound IDs used with xsound (must be unique strings)
Config.soundIdA = 'rave_deck_a'
Config.soundIdB = 'rave_deck_b'
