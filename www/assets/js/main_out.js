(function(wHandle, wjQuery) {
    if (navigator.appVersion.indexOf("MSIE") != -1)
	   alert("You're using a pretty old browser, some parts of the website might not work properly.");

    Date.now || (Date.now = function() {
        return (+new Date).getTime();
    });
    var LOAD_START = Date.now();
    Array.prototype.peek = function() {
        return this[this.length - 1];
    };
    Array.prototype.remove = function(a) {
        var i = this.indexOf(a);
        if (i !== -1) this.splice(i, 1);
        return i !== -1;
    };
    function bytesToColor(r, g, b) {
        var r1 = ("00" + (~~r).toString(16)).slice(-2);
        var g1 = ("00" + (~~g).toString(16)).slice(-2);
        var b1 = ("00" + (~~b).toString(16)).slice(-2);
        return `#${r1}${g1}${b1}`;
    }
    function colorToBytes(color) {
        if (color.length === 4)
            return { r: parseInt(color[1] + color[1], 16), g: parseInt(color[2] + color[2], 16), b: parseInt(color[3] + color[3], 16) };
        else if (color.length === 7)
            return { r: parseInt(color[1] + color[2], 16), g: parseInt(color[3] + color[4], 16), b: parseInt(color[5] + color[6], 16) };
        throw new Error(`invalid color ${color}`);
    }
    function darkenColor(color) {
        var a = colorToBytes(color);
        return bytesToColor(a.r * .9, a.g * .9, a.b * .9);
    }
    function cleanupObject(object) {
        for (var i in object)
            delete object[i];
    }
    var __buf = new DataView(new ArrayBuffer(8));
    function Writer(littleEndian) {
        this._e = littleEndian;
        this.reset();
        return this;
    }
    Writer.prototype = {
        writer: true,
        reset: function(littleEndian) {
            this._b = [];
            this._o = 0;
        },
        setUint8: function(a) {
            if (a >= 0 && a < 256) this._b.push(a);
            return this;
        },
        setInt8: function(a) {
            if (a >= -128 && a < 128) this._b.push(a);
            return this;
        },
        setUint16: function(a) {
            __buf.setUint16(0, a, this._e);
            this._move(2);
            return this;
        },
        setInt16: function(a) {
            __buf.setInt16(0, a, this._e);
            this._move(2);
            return this;
        },
        setUint32: function(a) {
            __buf.setUint32(0, a, this._e);
            this._move(4);
            return this;
        },
        setInt32: function(a) {
            __buf.setInt32(0, a, this._e);
            this._move(4);
            return this;
        },
        setFloat32: function(a) {
            __buf.setFloat32(0, a, this._e);
            this._move(4);
            return this;
        },
        setFloat64: function(a) {
            __buf.setFloat64(0, a, this._e);
            this._move(8);
            return this;
        },
        _move: function(b) {
            for (var i = 0; i < b; i++) this._b.push(__buf.getUint8(i));
        },
        setStringUTF8: function(s) {
            var bytesStr = unescape(encodeURIComponent(s));
            for (var i = 0, l = bytesStr.length; i < l; i++) this._b.push(bytesStr.charCodeAt(i));
            this._b.push(0);
            return this;
        },
        build: function() {
            return new Uint8Array(this._b);
        }
    };
    function Reader(view, offset, littleEndian) {
        this._e = littleEndian;
        if (view) this.repurpose(view, offset);
    }
    Reader.prototype = {
        reader: true,
        repurpose: function(view, offset) {
            this.view = view;
            this._o = offset || 0;
        },
        getUint8: function() {
            return this.view.getUint8(this._o++, this._e);
        },
        getInt8: function() {
            return this.view.getInt8(this._o++, this._e);
        },
        getUint16: function() {
            return this.view.getUint16((this._o += 2) - 2, this._e);
        },
        getInt16: function() {
            return this.view.getInt16((this._o += 2) - 2, this._e);
        },
        getUint32: function() {
            return this.view.getUint32((this._o += 4) - 4, this._e);
        },
        getInt32: function() {
            return this.view.getInt32((this._o += 4) - 4, this._e);
        },
        getFloat32: function() {
            return this.view.getFloat32((this._o += 4) - 4, this._e);
        },
        getFloat64: function() {
            return this.view.getFloat64((this._o += 8) - 8, this._e);
        },
        getStringUTF8: function() {
            var s = "", b;
            while ((b = this.view.getUint8(this._o++)) !== 0) s += String.fromCharCode(b);

            return decodeURIComponent(escape(s));
        }
    };
    var log = {
        verbosity: 4,
        error: function(a) { if (log.verbosity <= 0) return; console.error(a); },
        warn: function(a) { if (log.verbosity <= 1) return; console.warn(a); },
        info: function(a) { if (log.verbosity <= 2) return; console.info(a); },
        debug: function(a) { if (log.verbosity <= 3) return; console.debug(a); }
    };

    var wsUrl = null,
        SKIN_URL = "./skins/",
        USE_HTTPS = "https:" == wHandle.location.protocol,
        PI_2 = Math.PI * 2,
        SEND_1 = new Uint8Array([1, 1, 0, 0, 0]),
        UINT8_CACHE = {
            2: new Uint8Array([2]),
        },
        sending = {
            spawningName: null,
            spectate: false,
            qPress: false,
            qRelease: false,
            eject: false,
            minionEject: false,
            minionFreeze: false,
            split: 0,
            minionSplit: 0,
            chatMessages: []
        };

    function wsCleanup() {
        if (!ws) return;
        log.debug("ws cleanup trigger");
        ws.onopen = null;
        ws.onmessage = null;
        ws.close();
        ws = null;
    }
    function wsInit(url) {
        if (ws) {
            log.debug("ws init on existing conn");
            wsCleanup();
        }
        wjQuery("#connecting").show();
        ws = new WebSocket(`ws${USE_HTTPS ? "s" : ""}://${wsUrl = url}`);
        ws.binaryType = "arraybuffer";
        ws.onopen = wsOpen;
        ws.onmessage = wsMessage;
        ws.onerror = wsError;
        ws.onclose = wsClose;
    }
    function wsOpen() {
        disconnectDelay = 1000;
        wjQuery("#connecting").hide();
        wsSend(SEND_1);
        log.debug(`ws connected, using https: ${USE_HTTPS}`);
    }
    function wsError(error) {
        log.warn(error);
    }
    function wsClose(e) {
        log.debug(`ws disconnected ${e.code} '${e.reason}'`);
        wsCleanup();
        gameReset();
        setTimeout(function() {
            if (ws && ws.readyState === 1) return;
            wsInit(wsUrl);
        }, disconnectDelay *= 1.5);
    }
    function wsSend(data) {
        if (!ws) return;
        if (ws.readyState !== 1) return;
        if (data.build) ws.send(data.build());
        else ws.send(data);
    }
    function wsMessage(data) {
        syncUpdStamp = Date.now();
        var reader = new Reader(new DataView(data.data), 0, true);
        var packetId = reader.getUint8();
        switch (packetId) {
            case 0x02:
                stats.latency = syncUpdStamp - stats.pingLoopStamp;
                break;
            case 0x03:
                var globalFlags, i, l, flags, item, killer, killed, id, type, x, y, s, color, name, skin;
                globalFlags = reader.getUint16();
                if (globalFlags & 1) {
                    targetX = reader.getInt32();
                    targetY = reader.getInt32();
                    targetZ = reader.getFloat32();
                }
                if (globalFlags & 2) {
                    border.left = reader.getInt32();
                    border.right = reader.getInt32();
                    border.top = reader.getInt32();
                    border.bottom = reader.getInt32();
                    if (!mapCenterSet) {
                        mapCenterSet = true;
                        cameraX = targetX = border.centerX;
                        cameraY = targetY = border.centerY;
                        cameraZ = targetZ = 1;
                    }
                }
                if (globalFlags & 4) {
                    reader.getUint8();
                    reader.getUint8();
                    reader.getUint8();
                    reader.getUint8();
                    stats.pingLoopId = stats.pingLoopId || setInterval(function() {
                        wsSend(UINT8_CACHE[2]);
                        stats.pingLoopStamp = Date.now();
                    }, 2000);
                }
                if (globalFlags & 8) {
                    stats.info = {
                        name: reader.getStringUTF8(),
                        gamemode: reader.getStringUTF8(),
                        loadTime: reader.getFloat32(),
                        uptime: reader.getUint32(),
                        limit: reader.getUint16(),
                        external: reader.getUint16(),
                        internal: reader.getUint16(),
                        playing: reader.getUint16(),
                        spectating: reader.getUint16()
                    };
                    drawStats();
                }
                if (globalFlags & 16) {
                    l = reader.getUint16();
                    for (i = 0; i < l; i++) {
                        name = reader.getStringUTF8().trim();
                        color = bytesToColor(reader.getUint8(), reader.getUint8(), reader.getUint8());
                        flags = reader.getUint8();
                        var message = reader.getStringUTF8();
                        
                        var wait = Math.max(3000, 1000 + message.length * 150);
                        chat.waitUntil = syncUpdStamp - chat.waitUntil > 1000 ? syncUpdStamp + wait : chat.waitUntil + wait;
                       
                        chat.messages.push({
                            server: !!(flags & 1),
                            color: color,
                            name: name,
                            message: message,
                            time: syncUpdStamp
                        });
                        drawChat();
                    }
                }
                if (globalFlags & 32) {
                    leaderboard.items.splice(0, leaderboard.items.length);
                    switch (reader.getUint8()) {
                        case 1:
                            leaderboard.type = "ffa";
                            var position;
                            while ((position = reader.getUint16()) !== 0) {
                                flags = reader.getUint8();
                                if (flags & 2) hitSelfData = true;
                                leaderboard.items.push({
                                    me: !!(flags & 1),
                                    pos: position,
                                    name: reader.getStringUTF8()
                                });
                            }
                            break;
                        case 2:
                            leaderboard.type = "pie";
                            l = reader.getUint16();
                            for (i = 0; i < l; i++) leaderboard.items.push(reader.getFloat32());
                            break;
                        case 3:
                            leaderboard.type = "text";
                            l = reader.getUint16();
                            for (i = 0; i < l; i++) leaderboard.items.push(reader.getStringUTF8());
                            break;
                    }
                    drawLeaderboard();
                }
                while (globalFlags & 64 && (id = reader.getUint32()) !== 0) {
                    type = reader.getUint8();
                    x = reader.getInt32();
                    y = reader.getInt32();
                    s = reader.getUint16();
                    color = bytesToColor(reader.getUint8(), reader.getUint8(), reader.getUint8());
                    flags = reader.getUint8();
                    name = flags & 2 ? reader.getStringUTF8() : null;
                    skin = flags & 4 ? reader.getStringUTF8() : null;
                    item = new Cell(id, x, y, s, name, color, skin, type);
                    cells.byId[id] = item;
                    cells.list.push(item);
                    if (flags & 1) cells.mine.push(id);
                }
                while (globalFlags & 128 && (id = reader.getUint32()) !== 0) {
                    flags = reader.getUint8();
                    x = flags & 1 ? reader.getInt32() : null;
                    y = flags & 1 ? reader.getInt32() : null;
                    s = flags & 2 ? reader.getUint16() : null;
                    color = flags & 4 ? bytesToColor(reader.getUint8(), reader.getUint8(), reader.getUint8()) : null;
                    name = flags & 8 ? reader.getStringUTF8() : null;
                    skin = flags & 16 ? reader.getStringUTF8() : null;
                    item = cells.byId[id];
                    item.update(syncUpdStamp);
                    item.updated = syncUpdStamp;
                    x = x || item.nx;
                    y = y || item.ny;
                    s = s || item.ns;
                    item.ox = item.x;
                    item.oy = item.y;
                    item.os = item.s;
                    item.nx = x;
                    item.ny = y;
                    item.ns = s;
                    if (color) item.setColor(color);
                    if (skin) item.setSkin(skin);
                    if (name) item.setName(name);
                }
                while (globalFlags & 256 && (killed = reader.getUint32()) !== 0) {
                    killer = reader.getUint32();
                    if (!cells.byId.hasOwnProperty(killer) || !cells.byId.hasOwnProperty(killed))
                        continue;
                    cells.byId[killed].destroy(cells.byId[killer]);
                }
                while (globalFlags & 512 && (item = reader.getUint32()) !== 0) {
                    item = cells.byId[item] || null;
                    if (!item || item.destroyed) continue;
                    item.destroy(null);
                }
                break;
            default:
                wsCleanup();
                break;
        }
    }
    function sendMouseMove(x, y) {
        var writer = new Writer(true);
        writer.setUint8(0x03);
        writer.setUint32(x);
        writer.setUint32(y);
        writer.setUint8(sending.split);
        writer.setUint8(sending.minionSplit);
        sending.split = sending.minionSplit = 0;
        var flags = 0;
        if (sending.spawningName != null) flags |= 1;
        if (sending.spectate) flags |= 2, sending.spectate = false;
        if (sending.qPress) flags |= 4, sending.qPress = false;
        if (sending.qRelease) flags |= 8, sending.qRelease = false;
        if (sending.eject) flags |= 16, sending.eject = false;
        if (sending.minionEject) flags |= 32, sending.minionEject = false;
        if (sending.minionFreeze) flags |= 64, sending.minionFreeze = false;
        if (sending.chatMessages.length > 0) flags |= 128;
        writer.setUint8(flags);
        if (flags & 1) {
            writer.setStringUTF8(sending.spawningName);
            sending.spawningName = null;
        }
        if (flags & 128) {
            var l = sending.chatMessages.length;
            writer.setUint8(l);
            for (var i = 0; i < l; i++)
                writer.setStringUTF8(sending.chatMessages[i]);
            sending.chatMessages.splice(0, l);
        }
        wsSend(writer);
    }
    function sendPlay(name) {
        log.debug("play trigger");
        sending.spawningName = name;
    }
    function sendChat(text) {
        sending.chatMessages.push(text);
    }

    function gameReset() {
        cleanupObject(cells);
        cleanupObject(border);
        cleanupObject(leaderboard);
        cleanupObject(chat);
        cleanupObject(stats);
        chat.messages = [];
        leaderboard.items = [];
        cells.mine = [];
        cells.byId = { };
        cells.list = [];
        cameraX = cameraY = targetX = targetY = 0;
        cameraZ = targetZ = 1;
        mapCenterSet = false;
    }

    var cells = Object.create({
        mine: [],
        byId: { },
        list: [],
    });
    var border = Object.create({
        left: -2000,
        right: 2000,
        top: -2000,
        bottom: 2000,
        width: 4000,
        height: 4000,
        centerX: -1,
        centerY: -1
    });
    var leaderboard = Object.create({
        type: NaN,
        items: null,
        canvas: document.createElement("canvas"),
        teams: ["#F33", "#3F3", "#33F"]
    });
    var chat = Object.create({
        messages: [],
        waitUntil: 0,
        canvas: document.createElement("canvas"),
        visible: false,
    });
    var stats = Object.create({
        framesPerSecond: 0,
        latency: NaN,
        supports: null,
        info: null,
        pingLoopId: NaN,
        pingLoopStamp: null,
        canvas: document.createElement("canvas"),
        visible: false,
        score: NaN,
        maxScore: 0
    });

    var ws = null;
    var wsUrl = null;
    var disconnectDelay = 1000;

    var syncUpdStamp = Date.now();
    var syncAppStamp = Date.now();

    var mainCanvas = null;
    var mainCtx = null;
    var knownSkins = { };
    var loadedSkins = { };
    var escOverlayShown = false;
    var isTyping = false;
    var chatBox = null;
    var mapCenterSet = false;
    var cameraX = 0;
    var cameraY = 0;
    var cameraZ = 1;
    var cameraZInvd = 1;
    var targetX = 0;
    var targetY = 0;
    var targetZ = 1;
    var viewMult = 1;
    var mouseX = NaN;
    var mouseY = NaN;
    var mouseZ = 1;

    var settings = {
        mobile: "createTouch" in document,
        showMass: false,
        showNames: true,
        showLeaderboard: true,
        showChat: true,
        showGrid: true,
        showTextOutline: true,
        showColor: true,
        showSkins: true,
        showMinimap: true,
        darkTheme: false,
        allowGETipSet: false
    };
    var pressed = {
        space: false,
        w: false,
        e: false,
        r: false,
        t: false,
        p: false,
        q: false,
        esc: false
    };

    if (null !== wHandle.localStorage) {
        wjQuery(window).load(function() {
            wjQuery(".save").each(function() {
                var id = wjQuery(this).data("box-id");
                var value = wHandle.localStorage.getItem("checkbox-" + id);
                if (value && value == "true" && 0 != id) {
                    wjQuery(this).prop("checked", "true");
                    wjQuery(this).trigger("change");
                } else if (id == 0 && value != null)
                    wjQuery(this).val(value);
            });
            wjQuery(".save").change(function() {
                var id = wjQuery(this).data("box-id");
                var value = (id == 0) ? wjQuery(this).val() : wjQuery(this).prop("checked");
                wHandle.localStorage.setItem("checkbox-" + id, value);
            });
        });
    }
    wjQuery.ajax({
        type: "POST",
        dataType: "json",
        url: "checkdir.php",
        data: { "action": "getSkins" },
        success: function(data) {
            var stamp = Date.now();
            response = JSON.parse(data.names);
            for (var i = 0; i < response.length; i++)
                knownSkins[response[i]] = stamp;
            for (var i in knownSkins)
                if (knownSkins[i] !== stamp) delete knownSkins[i];
        }
    });

    function hideESCOverlay() {
        escOverlayShown = false;
        wjQuery("#overlays").hide();
    }
    function showESCOverlay() {
        escOverlayShown = true;
        wjQuery("#overlays").fadeIn(300);
    }

    function toCamera(ctx) {
        ctx.translate(mainCanvas.width / 2, mainCanvas.height / 2);
        scaleForth(ctx);
        ctx.translate(-cameraX, -cameraY);
    }
    function scaleForth(ctx) { ctx.scale(cameraZ, cameraZ); }
    function scaleBack(ctx) { ctx.scale(cameraZInvd, cameraZInvd); }
    function fromCamera(ctx) {
        ctx.translate(cameraX, cameraY);
        scaleBack(ctx);
        ctx.translate(-mainCanvas.width / 2, -mainCanvas.height / 2);
    }
    
    function drawChat() {
        if (chat.messages.length === 0 && settings.showChat)
            return chat.visible = false;
        chat.visible = true;
        var canvas = chat.canvas;
        var ctx = canvas.getContext("2d");
        var latestMessages = chat.messages.slice(-15);
        var lines = [];
        for (var i = 0, len = latestMessages.length; i < len; i++)
            lines.push([
                {
                    text: latestMessages[i].name,
                    color: latestMessages[i].color
                }, {
                    text: " " + latestMessages[i].message,
                    color: settings.darkTheme ? "#FFF" : "#000"
                }
            ]);
        var width = 0;
        var height = 20 * len + 2;
        for (var i = 0; i < len; i++) {
            var thisLineWidth = 0;
            var complexes = lines[i];
            for (var j = 0; j < complexes.length; j++) {
                ctx.font = "18px Ubuntu";
                complexes[j].width = ctx.measureText(complexes[j].text).width;
                thisLineWidth += complexes[j].width;
            }
            width = Math.max(thisLineWidth, width);
        }
        canvas.width = width;
        canvas.height = height;
        for (var i = 0; i < len; i++) {
            width = 0;
            var complexes = lines[i];
            for (var j = 0; j < complexes.length; j++) {
                ctx.font = "18px Ubuntu";
                ctx.fillStyle = complexes[j].color;
                ctx.fillText(complexes[j].text, width, 20 * (1 + i));
                width += complexes[j].width;
            }
        }
    }

    function drawStats() {
        if (!stats.info) return stats.visible = false;
        stats.visible = true;

        var canvas = stats.canvas;
        var ctx = canvas.getContext("2d");
        ctx.font = "14px Ubuntu";
        var rows = [
            `${stats.info.name} (${stats.info.gamemode})`,
            `${stats.info.external} / ${stats.info.limit} players`,
            `${stats.info.playing} playing`,
            `${stats.info.spectating} spectating`,
            `${stats.info.internal} bots`,
            `${(stats.info.loadTime * 2.5).toFixed(1)}% load @ ${prettyPrintTime(stats.info.uptime)}`
        ];
        var width = 0;
        for (var i = 0; i < rows.length; i++)
            width = Math.max(width, 2 + ctx.measureText(rows[i]).width + 2);
        canvas.width = width;
        canvas.height = rows.length * (14 + 2);
        ctx.font = "14px Ubuntu";
        ctx.fillStyle = settings.darkTheme ? "#AAA" : "#555";
        ctx.textBaseline = "top";
        for (var i = 0; i < rows.length; i++)
            ctx.fillText(rows[i], 2, -2 + i * (14 + 2));
    }
    function prettyPrintTime(seconds) {
        seconds = ~~seconds;
        var minutes = ~~(seconds / 60);
        if (minutes < 1) return "<1 min";
        var hours = ~~(minutes / 60);
        if (hours < 1) return minutes + "min";
        var days = ~~(hours / 24);
        if (days < 1) return hours + "h";
        return days + "d";
    }

    function drawLeaderboard() {
        if (leaderboard.type === NaN) return leaderboard.visible = false;
        if (!settings.showNames || leaderboard.items.length === 0)
            return leaderboard.visible = false;
        leaderboard.visible = true;
        var canvas = leaderboard.canvas;
        var ctx = canvas.getContext("2d");
        var len = leaderboard.items.length;

        canvas.width = 200;
        canvas.height = leaderboard.type !== "pie" ? 60 + 24 * len : 240;

        ctx.globalAlpha = .4;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, 200, canvas.height);

        ctx.globalAlpha = 1;
        ctx.fillStyle = "#FFF";
        ctx.font = "30px Ubuntu";
        ctx.fillText("Leaderboard", 100 - ctx.measureText("Leaderboard").width / 2, 40);

        if (leaderboard.type === "pie") {
            var last = 0;
            for (var i = 0; i < len; i++) {
                ctx.fillStyle = leaderboard.teams[i];
                ctx.beginPath();
                ctx.moveTo(100, 140);
                ctx.arc(100, 140, 80, last, (last += leaderboard.items[i] * PI_2), false);
                ctx.closePath();
                ctx.fill();
            }
        } else {
            var text, pos, isMe = false, w, start;
            ctx.font = "20px Ubuntu";
            for (var i = 0; i < len; i++) {
                if (leaderboard.type === "text")
                    text = leaderboard.items[i];
                else
                    pos = leaderboard.items[i].pos,
                    text = leaderboard.items[i].name,
                    isMe = leaderboard.items[i].me;

                ctx.fillStyle = isMe ? "#FAA" : "#FFF";
                if (leaderboard.type === "ffa")
                    text = pos + ". " + (text || "An unnamed cell");
                var start = ((w = ctx.measureText(text).width) > 200) ? 2 : 100 - w * 0.5;
                ctx.fillText(text, start, 70 + 24 * i);
            }
        }
    }
    function drawGrid() {
        mainCtx.save();
        mainCtx.lineWidth = 1;
        mainCtx.strokeStyle = settings.darkTheme ? "#AAA" : "#000";
        mainCtx.globalAlpha = 0.2;
        var step = 50, i;
            cW = mainCanvas.width / cameraZ, cH = mainCanvas.height / cameraZ,
            startLeft = (-cameraX + cW / 2) % step,
            startTop = (-cameraY + cH / 2) % step;

        scaleForth(mainCtx);
        mainCtx.beginPath();
        for (i = startLeft; i < cW; i += step) {
            mainCtx.moveTo(i, 0);
            mainCtx.lineTo(i, cH);
        }
        for (i = startTop; i < cH; i += step) {
            mainCtx.moveTo(0, i);
            mainCtx.lineTo(cW, i);
        }
        mainCtx.closePath();
        mainCtx.stroke();
        mainCtx.restore();
    }
    function drawMinimap() {
        if (border.centerX !== 0 || border.centerY !== 0 || !settings.showMinimap)
            // scramble level 2+ makes the minimap unusable
            // and is detectable with a non-zero map center
            return;
        mainCtx.save();
        var targetSize = 200;
        var width = targetSize * (border.width / border.height);
        var height = targetSize * (border.height / border.width);
        var beginX = mainCanvas.width / viewMult - width;
        var beginY = mainCanvas.height / viewMult - height;

        mainCtx.fillStyle = "#000";
        mainCtx.globalAlpha = 0.4;
        mainCtx.fillRect(beginX, beginY, width, height);
        mainCtx.globalAlpha = 1;

        var sectorCount = 5;
        var sectorNames = ["ABCDE", "12345"];
        var sectorWidth = width / sectorCount;
        var sectorHeight = height / sectorCount;
        var sectorNameSize = Math.min(sectorWidth, sectorHeight) / 3;

        mainCtx.fillStyle = settings.darkTheme ? "#666" : "#DDD";
        mainCtx.textBaseline = "middle";
        mainCtx.textAlign = "center";
        mainCtx.font = `${sectorNameSize}px Ubuntu`;

        for (var i = 0; i < sectorCount; i++) {
            var x = sectorWidth / 2 + i * sectorWidth;
            for (var j = 0; j < sectorCount; j++) {
                var y = sectorHeight / 2 + j * sectorHeight;
                mainCtx.fillText(`${sectorNames[0][i]}${sectorNames[1][j]}`, beginX + x, beginY + y);
            }
        }

        var myPosX = beginX + ((cameraX + border.width / 2) / border.width * width);
        var myPosY = beginY + ((cameraY + border.height / 2) / border.height * height);
        mainCtx.fillStyle = "#FAA";
        mainCtx.beginPath();
        mainCtx.arc(myPosX, myPosY, 5, 0, PI_2, false);
        mainCtx.closePath();
        mainCtx.fill();

        // draw name above user's pos if he has a cell on the screen 
        var cell = null;
        for (var i = 0, l = cells.mine.length; i < l; i++)
            if (cells.byId.hasOwnProperty(cells.mine[i])) {
                cell = cells.byId[cells.mine[i]];
                break;
            }
        if (cell !== null) {
            mainCtx.fillStyle = settings.darkTheme ? "#DDD" : "#222";
            var textSize = sectorNameSize;
            mainCtx.font = `${textSize}px Ubuntu`;
            mainCtx.fillText(cell.name, myPosX, myPosY - 7 - textSize / 2);
        }

        mainCtx.restore();
    }

    function drawGame() {
        stats.framesPerSecond += (1000 / Math.max(Date.now() - syncAppStamp, 1) - stats.framesPerSecond) / 10;
        syncAppStamp = Date.now();

        var drawList = cells.list.slice(0).sort(cellSort);
        for (var i = 0, l = drawList.length; i < l; i++)
            drawList[i].update(syncAppStamp);
        cameraUpdate();

        mainCtx.save();

        mainCtx.fillStyle = settings.darkTheme ? "#111" : "#F2FBFF";
        mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
        if (settings.showGrid) drawGrid();

        toCamera(mainCtx);

        for (var i = 0, l = drawList.length; i < l; i++)
            drawList[i].draw(mainCtx);

        fromCamera(mainCtx);
        mainCtx.scale(viewMult, viewMult);

        var height = 2;
        mainCtx.fillStyle = settings.darkTheme ? "#FFF" : "#000";
        mainCtx.textBaseline = "top";
        if (!isNaN(stats.score)) {
            mainCtx.font = "30px Ubuntu";
            mainCtx.fillText(`Score: ${stats.score}`, 2, height);
            height += 30;
        }
        mainCtx.font = "20px Ubuntu";
        var gameStatsText = `${~~stats.framesPerSecond} FPS`;
        if (!isNaN(stats.latency)) gameStatsText += ` ${stats.latency}ms ping`;
        mainCtx.fillText(gameStatsText, 2, height);
        height += 24;

        if (stats.visible)
            mainCtx.drawImage(stats.canvas, 2, height);
        if (leaderboard.visible)
            mainCtx.drawImage(
                leaderboard.canvas,
                mainCanvas.width / viewMult - 10 - leaderboard.canvas.width,
                10);
        if (chat.visible || isTyping) {
            mainCtx.globalAlpha = isTyping ? 1 : Math.max(1000 - syncAppStamp + chat.waitUntil, 0) / 1000;
            mainCtx.drawImage(
                chat.canvas,
                10 / viewMult,
                (mainCanvas.height - 55) / viewMult - chat.canvas.height
            );
            mainCtx.globalAlpha = 1;
        }
        drawMinimap();

        mainCtx.restore();

        cacheCleanup();
        wHandle.requestAnimationFrame(drawGame);
    }
    
    function cellSort(a, b) {
        return a.s === b.s ? a.id - b.id : a.s - b.s;
    }

    function cameraUpdate() {
        var myCells = [];
        for (var i = 0; i < cells.mine.length; i++)
            if (cells.byId.hasOwnProperty(cells.mine[i]))
                myCells.push(cells.byId[cells.mine[i]]);
        if (myCells.length > 0) {
            var x = 0,
                y = 0,
                s = 0,
                score = 0;
            for (var i = 0, l = myCells.length; i < l; i++) {
                var cell = myCells[i];
                score += ~~(cell.ns * cell.ns / 100);
                x += cell.x;
                y += cell.y;
                s += cell.s;
            }
            targetX = x / l;
            targetY = y / l;
            targetZ = Math.pow(Math.min(64 / s, 1), .4);
            cameraX += (targetX - cameraX) / 2;
            cameraY += (targetY - cameraY) / 2;
            stats.score = score;
            stats.maxScore = Math.max(stats.maxScore, score);
        } else {
            stats.score = NaN;
            stats.maxScore = 0;
            cameraX += (targetX - cameraX) / 20;
            cameraY += (targetY - cameraY) / 20;
        }
        cameraZ += (targetZ * viewMult * mouseZ - cameraZ) / 9;
        cameraZInvd = 1 / cameraZ;
    }

    function Cell(id, x, y, s, name, color, skin, type) {
        this.id = id;
        this.x = this.nx = this.ox = x;
        this.y = this.ny = this.oy = y;
        this.s = this.ns = this.os = s;
        this.setColor(color);
        this.setName(name);
        this.setSkin(skin);
        this.jagged = type === 2;
        this.ejected = type === 3;
        this.born = syncUpdStamp;
    }
    Cell.prototype = {
        destroyed: false,
        id: 0, diedBy: 0,
        ox: 0, x: 0, nx: 0,
        oy: 0, y: 0, ny: 0,
        os: 0, s: 0, ns: 0,
        nameSize: 0, drawNameSize: 0,
        color: "#FFF", sColor: "#E5E5E5",
        skin: null, jagged: false,
        born: null, updated: null, dead: null, // timestamps
        destroy: function(killerId) {
            delete cells.byId[this.id];
            if (cells.mine.remove(this.id) && cells.mine.length === 0)
                showESCOverlay();
            this.destroyed = true;
            this.dead = syncUpdStamp;
            if (killerId && !this.diedBy)
                this.diedBy = killerId;
        },
        update: function(relativeTime) {
            var dt = (relativeTime - this.updated) / 120;
            dt = Math.max(Math.min(dt, 1), 0);
            if (this.destroyed && Date.now() > this.dead + 200)
                cells.list.remove(this);
            else if (this.diedBy && cells.byId.hasOwnProperty(this.diedBy)) {
                this.nx = cells.byId[this.diedBy].x;
                this.ny = cells.byId[this.diedBy].y;
            }
            this.x = this.ox + (this.nx - this.ox) * dt;
            this.y = this.oy + (this.ny - this.oy) * dt;
            this.s = this.os + (this.ns - this.os) * dt;
            this.nameSize = ~~(~~(Math.max(~~(0.3 * this.ns), 24)) / 3) * 3;
            this.drawNameSize = ~~(~~(Math.max(~~(0.3 * this.s), 24)) / 3) * 3;
        },
        setName: function(value) {
            var nameSkin = /\{([\w\W]+)\}/.exec(value);
            if (this.skin === null && nameSkin !== null) {
                this.name = value.replace(nameSkin[0], "").trim();
                this.setSkin(nameSkin[1]);
            } else this.name = value;
        },
        setSkin: function(value) {
            this.skin = (value && value[0] === "%" ? value.slice(1) : value) || this.skin;
            if (this.skin === null || !knownSkins.hasOwnProperty(this.skin) || loadedSkins[this.skin])
                return;
            loadedSkins[this.skin] = new Image();
            loadedSkins[this.skin].src = `${SKIN_URL}${this.skin}.png`;
        },
        setColor: function(value) {
            if (!value) { log.warn("got no color"); return; }
            this.color = value;
            this.sColor = darkenColor(value);
        },
        draw: function(ctx) {
            ctx.save();
            this.drawShape(ctx);
            this.drawText(ctx);
            ctx.restore();
        },
        drawShape: function(ctx) {
            ctx.fillStyle = settings.showColor ? this.color : Cell.prototype.color;
            ctx.strokeStyle = settings.showColor ? this.sColor : Cell.prototype.sColor;
            ctx.lineWidth = Math.max(~~(this.s / 50), 10);
            if (!this.ejected && 20 < this.s)
                this.s -= ctx.lineWidth / 2 - 2;

            ctx.beginPath();
            if (this.jagged) {
                var pointCount = 120;
                var incremental = PI_2 / pointCount;
                ctx.moveTo(this.x, this.y + this.s + 3);
                for (var i = 1; i < pointCount; i++) {
                    var angle = i * incremental;
                    var dist = this.s - 3 + (i % 2 === 0) * 6;
                    ctx.lineTo(
                        this.x + dist * Math.sin(angle),
                        this.y + dist * Math.cos(angle)
                    )
                }
                ctx.lineTo(this.x, this.y + this.s + 3);
            } else ctx.arc(this.x, this.y, this.s, 0, PI_2, false);
            ctx.closePath();

            if (this.destroyed)
                ctx.globalAlpha = Math.max(200 - Date.now() + this.dead, 0) / 100;
            else ctx.globalAlpha = Math.min(Date.now() - this.born, 200) / 100;
            
            if (!this.ejected && 20 < this.s)
                ctx.stroke();
            ctx.fill();
            if (settings.showSkins && this.skin) {
                var skin = loadedSkins[this.skin];
                if (skin && skin.complete && skin.width && skin.height) {
                    ctx.save();
                    ctx.clip();
                    scaleBack(ctx);
                    var sScaled = this.s * cameraZ;
                    ctx.drawImage(skin,
                        this.x * cameraZ - sScaled,
                        this.y * cameraZ - sScaled,
                        sScaled *= 2, sScaled);
                    scaleForth(ctx);
                    ctx.restore();
                }
            }
            if (!this.ejected && 20 < this.s)
                this.s += ctx.lineWidth / 2 - 2;
        },
        drawText: function(ctx) {
            if (this.s < 20 || this.jagged) return;
            if (settings.showMass && (cells.mine.indexOf(this.id) !== -1 || cells.mine.length === 0)) {
                var mass = (~~(this.s * this.s / 100)).toString();
                if (this.name && settings.showNames) {
                    drawText(ctx, false, this.x, this.y, this.nameSize, this.drawNameSize, this.name);
                    var y = this.y + Math.max(this.s / 4.5, this.nameSize / 1.5);
                    drawText(ctx, true, this.x, y, this.nameSize / 2, this.drawNameSize / 2, mass);
                } else drawText(ctx, true, this.x, this.y, this.nameSize / 2, this.drawNameSize / 2, mass);
            } else if (this.name && settings.showNames)
                drawText(ctx, false, this.x, this.y, this.nameSize, this.drawNameSize, this.name);
        }
    };

    function cacheCleanup() {
        for (var i in cachedNames) {
            for (var j in cachedNames[i])
                if (syncAppStamp - cachedNames[i][j].accessTime >= 5000)
                    delete cachedNames[i][j];
            if (cachedNames[i] === { }) delete cachedNames[i];
        }
        for (var i in cachedMass)
            if (syncAppStamp - cachedMass[i].accessTime >= 5000)
                delete cachedMass[i];
    }

    // 2-var draw-stay cache
    var cachedNames = { };
    var cachedMass  = { };

    function drawTextOnto(canvas, ctx, text, size) {
        ctx.font = `${size}px Ubuntu`;
        ctx.lineWidth = settings.showTextOutline ? Math.max(~~(size / 10), 2) : 2;
        canvas.width = ctx.measureText(text).width + 2 * ctx.lineWidth;
        canvas.height = 4 * size;
        ctx.font = `${size}px Ubuntu`;
        ctx.lineWidth = settings.showTextOutline ? Math.max(~~(size / 10), 2) : 2;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillStyle = "#FFF"
        ctx.strokeStyle = "#000";
        ctx.translate(canvas.width / 2, 2 * size);
        (ctx.lineWidth !== 1) && ctx.strokeText(text, 0, 0);
        ctx.fillText(text, 0, 0);
    }
    function drawRaw(ctx, x, y, text, size) {
        ctx.font = `${size}px Ubuntu`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.lineWidth = settings.showTextOutline ? Math.max(~~(size / 10), 2) : 2;
        ctx.fillStyle = "#FFF"
        ctx.strokeStyle = "#000";
        (ctx.lineWidth !== 1) && ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
        ctx.restore();
    }
    function newNameCache(value, size) {
        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");
        drawTextOnto(canvas, ctx, value, size);

        cachedNames[value] = cachedNames[value] || { };
        cachedNames[value][size] = {
            width: canvas.width,
            height: canvas.height,
            canvas: canvas,
            value: value,
            size: size,
            accessTime: syncAppStamp
        };
        return cachedNames[value][size];
    }
    function newMassCache(size) {
        var canvases = {
            "0": { }, "1": { }, "2": { }, "3": { }, "4": { },
            "5": { }, "6": { }, "7": { }, "8": { }, "9": { }
        };
        for (var value in canvases) {
            var canvas = canvases[value].canvas = document.createElement("canvas");
            var ctx = canvas.getContext("2d");
            drawTextOnto(canvas, ctx, value, size);
            canvases[value].canvas = canvas;
            canvases[value].width = canvas.width;
            canvases[value].height = canvas.height;
        }
        cachedMass[size] = {
            canvases: canvases,
            size: size,
            lineWidth: settings.showTextOutline ? Math.max(~~(size / 10), 2) : 2,
            accessTime: syncAppStamp
        };
        return cachedMass[size];
    }
    function toleranceTest(a, b, tolerance) {
        return (a - tolerance) <= b && b <= (a + tolerance);
    }
    function getNameCache(value, size) {
        if (!cachedNames[value]) return newNameCache(value, size);
        var sizes = Object.keys(cachedNames[value]);
        for (var i = 0, l = sizes.length; i < l; i++)
            if (toleranceTest(size, sizes[i], size / 4))
                return cachedNames[value][sizes[i]];
        return newNameCache(value, size);
    }
    function getMassCache(size) {
        var sizes = Object.keys(cachedMass);
        for (var i = 0, l = sizes.length; i < l; i++)
            if (toleranceTest(size, sizes[i], size / 4))
                return cachedMass[sizes[i]];
        return newMassCache(size);
    }

    function drawText(ctx, isMass, x, y, size, drawSize, value) {
        ctx.save();
        if (size > 500) return drawRaw(ctx, x, y, value, drawSize);
        ctx.imageSmoothingQuality = "high";
        if (isMass) {
            var cache = getMassCache(size);
            cache.accessTime = syncAppStamp;
            var canvases = cache.canvases;
            var correctionScale = drawSize / cache.size;

            // calculate width
            var width = 0;
            for (var i = 0; i < value.length; i++)
                width += canvases[value[i]].width - 2 * cache.lineWidth;
            
            ctx.scale(correctionScale, correctionScale);
            x /= correctionScale;
            y /= correctionScale;
            x -= width / 2;
            for (var i = 0; i < value.length; i++) {
                var item = canvases[value[i]];
                ctx.drawImage(item.canvas, x, y - item.height / 2);
                x += item.width - 2 * cache.lineWidth;
            }
        } else {
            var cache = getNameCache(value, size);
            cache.accessTime = syncAppStamp;
            var canvas = cache.canvas;
            var correctionScale = drawSize / cache.size;
            ctx.scale(correctionScale, correctionScale);
            x /= correctionScale;
            y /= correctionScale;
            ctx.drawImage(canvas, x - canvas.width / 2, y - canvas.height / 2);
        }
        ctx.restore();
    }

    function init() {
        mainCanvas = document.getElementById("canvas");
        mainCtx = mainCanvas.getContext("2d");
        chatBox = document.getElementById("chat_textbox");
        mainCanvas.focus();
        function handleScroll(event) {
            mouseZ *= Math.pow(.9, event.wheelDelta / -120 || event.detail || 0);
            //1 > mouseZ && (mouseZ = 1);
            mouseZ > 4 / mouseZ && (mouseZ = 4 / mouseZ);
        }
        if (/firefox/i.test(navigator.userAgent))
            document.addEventListener("DOMMouseScroll", handleScroll, false);
        else
            document.body.onmousewheel = handleScroll;
        wHandle.onkeydown = function(event) {
            switch (event.keyCode) {
                case 13: // enter
                    if (escOverlayShown) break;
                    if (!settings.showChat) break;
                    if (isTyping) {
                        chatBox.blur();
                        var chattxt = chatBox.value;
                        if (chattxt.length > 0) sendChat(chattxt);
                        chatBox.value = "";
                    } else chatBox.focus();
                    break;
                case 32: // space
                    if (isTyping || escOverlayShown || pressed.space) break;
                    sending.split++;
                    pressed.space = true;
                    break;
                case 87: // W
                    if (isTyping || escOverlayShown) break;
                    sending.eject = true;
                    pressed.w = true;
                    break;
                case 81: // Q
                    if (isTyping || escOverlayShown || pressed.q) break;
                    sending.qPress = true;
                    pressed.q = true;
                    break;
                case 69: // E
                    if (isTyping || escOverlayShown || pressed.e) break;
                    sending.minionSplit++;
                    pressed.e = true;
                    break;
                case 82: // R
                    if (isTyping || escOverlayShown || pressed.r) break;
                    sending.minionEject = true;
                    pressed.r = true;
                    break;
                case 84: // T
                    if (isTyping || escOverlayShown || pressed.t) break;
                    sending.minionFreeze = true;
                    pressed.t = true;
                    break;
                case 80: // P
                    if (isTyping || escOverlayShown || pressed.p) break;
                    sending.minionPelletMode = true;
                    pressed.p = true;
                    break;
                case 27: // esc
                    if (pressed.esc) break;
                    pressed.esc = true;
                    if (escOverlayShown) hideESCOverlay();
                    else showESCOverlay();
                    break;
            }
        };
        wHandle.onkeyup = function(event) {
            switch (event.keyCode) {
                case 32: // space
                    pressed.space = false;
                    break;
                case 87: // W
                    pressed.w = false;
                    break;
                case 81: // Q
                    if (pressed.q) sending.qRelease = true;
                    pressed.q = false;
                    break;
                case 69: // E
                    pressed.e = false;
                    break;
                case 82: // R
                    pressed.r = false;
                    break;
                case 84: // T
                    pressed.t = false;
                    break;
                case 80: // P
                    pressed.p = false;
                    break;
                case 27: // esc
                    pressed.esc = false;
                    break;
            }
        };
        chatBox.onblur = function() {
            isTyping = false;
            drawChat();
        };
        chatBox.onfocus = function() {
            isTyping = true;
            drawChat();
        };
        mainCanvas.onmousemove = function(event) {
            mouseX = event.clientX;
            mouseY = event.clientY;
        };
        setInterval(function() {
            // send mouse update
            sendMouseMove(
                (mouseX - mainCanvas.width / 2) / cameraZ + cameraX,
                (mouseY - mainCanvas.height / 2) / cameraZ + cameraY
            );
        }, 40);
        wHandle.onresize = function() {
            var cW = mainCanvas.width = wHandle.innerWidth,
                cH = mainCanvas.height = wHandle.innerHeight;
            viewMult = Math.sqrt(Math.min(cH / 1080, cW / 1920));
        };
        wHandle.onresize();
        log.info(`init done in ${Date.now() - LOAD_START}ms`);
        gameReset();
        showESCOverlay();

        if (settings.allowGETipSet && wHandle.location.search) {
            var div = /ip=([\w\W]+):([0-9]+)/.exec(wHandle.location.search.slice(1))
            if (div) wsInit(`${div[1]}:${div[2]}`);
        }

        window.requestAnimationFrame(drawGame);
    }
    wHandle.setserver = function(arg) {
        if (wsUrl === arg) return;
        wsInit(arg);
    };
    wHandle.setDarkTheme = function(a) {
        settings.darkTheme = a;
        drawStats();
    };
    wHandle.setShowMass = function(a) {
        settings.showMass = a;
    };
    wHandle.setSkins = function(a) {
        settings.showSkins = a;
    };
    wHandle.setColors = function(a) {
        settings.showColor = !a;
    };
    wHandle.setNames = function(a) {
        settings.showNames = a;
        drawLeaderboard();
    };
    wHandle.setChatHide = function(a) {
        settings.showChat = !a;
        drawChat();
    };
    wHandle.setMinimap = function(a) {
        settings.showMinimap = !a;
    };
    wHandle.spectate = function(a) {
        sending.spectate = true;
        stats.maxScore = 0;
        hideESCOverlay();
    };
    wHandle.play = function(a) {
        sendPlay(a);
        hideESCOverlay();
    };
    wHandle.openSkinsList = function() {
        if (wjQuery("#inPageModalTitle").text() === "Skins") return;
        wjQuery.get("include/gallery.php").then(function(data) {
            wjQuery("#inPageModalTitle").text("Skins");
            wjQuery("#inPageModalBody").html(data);
        });
    };
    wHandle.onload = init;
})(window, window.jQuery);
