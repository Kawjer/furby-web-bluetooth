const fluff_service = 'dab91435-b5a1-e29c-b041-bcd562613bde';

var furby_uuids = {
    'GeneralPlusListen': 'dab91382-b5a1-e29c-b041-bcd562613bde',
    'GeneralPlusWrite':  'dab91383-b5a1-e29c-b041-bcd562613bde',
    'NordicListen':      'dab90756-b5a1-e29c-b041-bcd562613bde',
    'NordicWrite':       'dab90757-b5a1-e29c-b041-bcd562613bde',
    'RSSIListen':        'dab90755-b5a1-e29c-b041-bcd562613bde',
    'F2FListen':         'dab91440-b5a1-e29c-b041-bcd562613bde',
    'F2FWrite':          'dab91441-b5a1-e29c-b041-bcd562613bde',
    'FileWrite':         'dab90758-b5a1-e29c-b041-bcd562613bde'
};

var file_transfer_modes = {
    1: 'EndCurrentTransfer',
    2: 'ReadyToReceive',
    3: 'FileTransferTimeout',
    4: 'ReadyToAppend',
    5: 'FileReceivedOk',
    6: 'FileReceivedErr'
};

const SLOT_EMPTY = 0;
const SLOT_UPLOADING = 1;
const SLOT_FILLED = 2;
const SLOT_ACTIVE = 3;

function flipDict(d) {
    let flipped = {};
    for (let k in d) {
        let v = d[k];
        flipped[v] = k;
    }
    return flipped;
}

var uuid_lookup = flipDict(furby_uuids);
var file_transfer_lookup = flipDict(file_transfer_modes);

var device;
var isConnected = false;
var isTransferring = false;
var furby_chars = {};
var gp_listen_callbacks = [];
var nordicListener = null;
var keepAliveTimer = null;
var lastCommandSent = 0;
var NO_RESPONSE = Symbol();

/* =========================
   PERSONALITY SYSTEM
========================= */

var personality = 0;

function personalityUp() {
    personality += 1;
    log(`Personality = ${personality}`);
    applyPersonality();
}

function personalityDown() {
    personality = Math.max(0, personality - 1);
    log(`Personality = ${personality}`);
    applyPersonality();
}

function applyPersonality() {
    if (personality <= 0) {
        setAntennaColor(255, 255, 255);
    } else if (personality % 3 === 1) {
        setAntennaColor(0, 255, 0);
    } else if (personality % 3 === 2) {
        setAntennaColor(0, 0, 255);
    } else {
        setAntennaColor(255, 0, 0);
    }
}

/* ========================= */

function log() {
    let bits = [];
    for (let arg of arguments) {
        if (DataView.prototype.isPrototypeOf(arg))
            bits.push(buf2hex(arg));
        else
            bits.push('' + arg);
    }
    let s = bits.join(' ');
    console.log(s);
    let o = document.getElementById('out');
    o.textContent += s + "\n";
    o.scrollTop = o.scrollHeight;
}

function sendGPCmd(data, response_prefix) {
    return new Promise((resolve, reject) => {
        var hnd;

        if (response_prefix != NO_RESPONSE) {
            hnd = addGPListenCallback(response_prefix, buf => {
                removeGPListenCallback(hnd);
                resolve(buf);
            });
        }

        lastCommandSent = performance.now();

        furby_chars.GeneralPlusWrite.writeValue(new Uint8Array(data))
            .then(() => {
                if (response_prefix == NO_RESPONSE)
                    resolve();
            })
            .catch(error => {
                if (response_prefix != NO_RESPONSE)
                    removeGPListenCallback(hnd);
                reject(error);
            });
    });
}

function addGPListenCallback(response_prefix, fn) {
    let handle = gp_listen_callbacks.length;
    gp_listen_callbacks[handle] = [fn, response_prefix];
    return handle;
}

function removeGPListenCallback(handle) {
    delete gp_listen_callbacks[handle];
}

function setAntennaColor(r, g, b) {
    return sendGPCmd([0x14, r, g, b], NO_RESPONSE);
}

/* =========================
   ALL YOUR ORIGINAL CODE BELOW (UNCHANGED)
========================= */

// (KEEP EVERYTHING ELSE EXACTLY AS YOU HAD IT)
// I am NOT rewriting the rest to avoid breaking BLE/DLC logic.
