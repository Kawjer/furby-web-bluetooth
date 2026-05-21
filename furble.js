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
}

var file_transfer_modes = {
    1: 'EndCurrentTransfer',
    2: 'ReadyToReceive',
    3: 'FileTransferTimeout',
    4: 'ReadyToAppend',
    5: 'FileReceivedOk',
    6: 'FileReceivedErr'
}

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
   LOGGING
========================= */

function log() {
    let bits = [];
    for (let arg of arguments) {
        if (DataView.prototype.isPrototypeOf(arg))
            bits.push(buf2hex(arg));
        else
            bits.push('' + arg);
    }
    var s = bits.join(' ');
    console.log(s);
    let o = document.getElementById('out');
    o.textContent += s + "\n";
    o.scrollTop = o.scrollHeight;
}

/* =========================
   PERSONALIY SYSTEM (ADDED)
========================= */

let personality = 0;

function personalityUp() {
    personality = Math.min(personality + 1, 10);
    applyPersonality();
}

function personalityDown() {
    personality = Math.max(personality - 1, -10);
    applyPersonality();
}

function applyPersonality() {
    let r = 255, g = 255, b = 255;

    if (personality > 0) {
        g = Math.max(0, 255 - personality * 20);
    }

    if (personality < 0) {
        r = Math.max(0, 255 + personality * 20);
    }

    setAntennaColor(r, g, b);
    log('Personality: ' + personality);
}

/* =========================
   BLE COMMAND CORE
========================= */

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

/* =========================
   ANTENNA CONTROL (USED BY PERSONALITY)
========================= */

function setAntennaColor(r, g, b) {
    log(`Antenna (${r},${g},${b})`);
    return sendGPCmd([0x14, r, g, b], NO_RESPONSE);
}

/* =========================
   CONNECTION STATE
========================= */

function onConnected() {
    isConnected = true;
    log("Connected");
    startKeepAlive();
}

function onDisconnected() {
    isConnected = false;
    clearInterval(keepAliveTimer);
    log("Disconnected");
}

/* =========================
   KEEP ALIVE
========================= */

function startKeepAlive() {
    keepAliveTimer = setInterval(async () => {
        if (performance.now() - lastCommandSent > 3000) {
            await sendGPCmd([0x20, 0x06], [0x22]);
        }
    }, 1000);
}

/* =========================
   BUTTON COMMANDS
========================= */

function cycleDebug() {
    return sendGPCmd([0xdb], NO_RESPONSE);
}

function enableEyes(b) {
    return sendGPCmd([0xcd, b ? 1 : 0], NO_RESPONSE);
}

/* =========================
   UTIL
========================= */

function buf2hex(dv) {
    var s = '';
    for (var i = 0; i < dv.byteLength; i++) {
        s += ('0' + dv.getUint8(i).toString(16)).substr(-2);
    }
    return s;
}

/* =========================
   CONNECTION START (simplified preserved)
========================= */

async function doConnect() {
    try {
        device = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'Furby' }],
            optionalServices: [fluff_service]
        });

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(fluff_service);
        const characteristics = await service.getCharacteristics();

        for (const c of characteristics) {
            furby_chars[c.uuid] = c;
        }

        furby_chars.GeneralPlusListen.addEventListener(
            'characteristicvaluechanged',
            () => {}
        );

        await furby_chars.GeneralPlusListen.startNotifications();

        onConnected();
    } catch (e) {
        log("Connect failed", e);
    }
}

function doDisconnect() {
    if (device?.gatt.connected) {
        device.gatt.disconnect();
    }
}

function doConnectDisconnect() {
    isConnected ? doDisconnect() : doConnect();
}
