(function(wHandle, wjQuery) {
    Date.now || (Date.now = function() {
        return (+new Date).getTime();
    });
    Array.prototype.remove = function(a) {
        let i = this.indexOf(a);
        if (i !== -1) {
            this.splice(index, 1);
            return true;
        }
        return false;
    };
    var CONNECT_TO,
        SKIN_URL = "./skins/",
        USE_HTTPS = "https:" == wHandle.location.protocol,
        BORDER_DEFAULT = {
            top: -2E3,
            left: -2E3,
            right: 2E3,
            bottom: 2E3
        },
        SEND_254 = new Uint8Array([254, 6, 0, 0, 0]),
        SEND_255 = new Uint8Array([255, 1, 0, 0, 0]),
        UINT8_CACHE = {
            17: new Uint8Array([17]),
            21: new Uint8Array([21]),
            18: new Uint8Array([18]),
            19: new Uint8Array([19]),
            22: new Uint8Array([22]),
            23: new Uint8Array([23]),
            24: new Uint8Array([24]),
        }
        LOAD_START = +new Date,
        FPS_MAXIMUM = 1000,
        USE_WRAF = false,
        ws = null,
        disconnectDelay = 1;

    function Disconnect() {
        if (!ws) return;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        ws = null;
        resetGameVariables();
    }

    function resetGameVariables() {
        nodesID = { };
        nodes = [];
        myNodes = [];
        leaderboard = [];
        leaderboardType = "none";
        centerX = 0;
        centerY = 0;
        border = BORDER_DEFAULT;
        knownSkins = [];
        loadedSkins = [];
        viewZoom = 1;
        userName = "";
        chatText = "";
        gameType = -1;
        serverName = "Realm of emptiness";
        _sizeChange = false;
    }

    function Connect(to) {
        if (ws) Disconnect();
        wjQuery("#connecting").show();
        ws = new WebSocket((USE_HTTPS ? "uws://" : "ws://") + (CONNECT_TO = to));
        ws.binaryType = "arraybuffer";
        ws.onopen = WsOpen;
        ws.onmessage = WsMessage;
        ws.onerror = WsError;
        ws.onclose = WsClose;
        log.info("Connecting to " + to);
    }

    function WsOpen() {
        disconnectDelay = 1;
        wjQuery("#connecting").hide();
        WsSend(SEND_254);
        WsSend(SEND_255);
        serverName = "Unknown";
        log.info("Connected to " + CONNECT_TO);
        log.debug("HTTPS: " + USE_HTTPS);
    }

    function WsMessage(data) {
        var reader = new Reader(new DataView(data.data), 0, true),
            i, count,
            packet = reader.getUint8();
        switch (packet) {
            case 0x20:
                // New cell of mine
                myNodes.push(reader.getUint32());
                break;
            case 0x63:
                // Chat message
                // Unimplemented
                break;
            case 0x12:
                // Clear all
                for (var i in nodesID) nodesID[i].destroy();
            case 0x14:
                // Clear nodes (case 0x12 slips here too)
                myNodes = [];
                break;
            case 0x15:
                // Draw line
                // Unimplemented
                break;
            case 0xFE:
                // Server stat
                // Unimplemented
                break;
            case 0x40:
                // Set border
                border.left = reader.getFloat64();
                border.top = reader.getFloat64();
                border.right = reader.getFloat64();
                border.bottom = reader.getFloat64();
                if (data.data.byteLength !== 33) {
                    // Game type and server name is given
                    gameType = reader.getUint32();
                    serverName = reader.getStringUTF8();
                }
                break;
            // Leaderboard update packets
            case 0x30:
                // Text list, somewhat deprecated
                if (leaderboardType != 0x30) {
                    leaderboardType = 0x30;
                    log.info("Got somewhat deprecated leaderboard type 48 (0x30). Server-side is possibly Ogar")
                }

                count = reader.getUint32();
                for (i = 0; i < count; ++i)
                    leaderboard.push(reader.getStringUTF8());
                drawLeaderboard();
                break;
            case 0x31:
                // FFA list
                leaderboardType = 0x31;
                count = reader.getUint32();
                for (i = 0; i < count; ++i) {
                    leaderboard.push({
                        me: reader.getUint32(),
                        name: reader.getStringUTF8()
                    });
                }
                drawLeaderboard();
                break;
            case 0x32:
                // Pie chart
                leaderboardType = 0x32;
                count = reader.getUint32();
                for (i = 0; i < count; ++i)
                    leaderboard.push(reader.getFloat32());
                break;
            case 0x10:
                // Update nodes
                var killer, killed, id, node, x, y, size, flags,
                    updColor, updName, updSkin, // Flags
                    time = Date.now();

                // Consume records
                count = reader.getUint16();
                for (i = 0; i < count; i++) {
                    killer = reader.getUint32();
                    killed = reader.getUint32();
                    if (killer && killed && killed !== 0) nodesID[killed].destroy();
                }

                // Node update records
                while (1) {
                    id = reader.getUint32();
                    if (0 === id) break;

                    node = nodesID.hasOwnProperty(id) ? nodesID[id] : null;

                    x = reader.getInt32();
                    y = reader.getInt32();
                    size = reader.getUint16();

                    flags = reader.getUint8();
                    updColor = flags & 0x02;
                    updName = flags & 0x08;
                    updSkin = flags & 0x04;
                    var color = null,
                        name = null,
                        skin = null,
                        tmp = "";

                    if (updColor) {
                        color = "#";
                        tmp = reader.getUint8();
                        color += tmp.length === 1 ? ("0" + tmp) : tmp;
                        tmp = reader.getUint8();
                        color += tmp.length === 1 ? ("0" + tmp) : tmp;
                        tmp = reader.getUint8();
                        color += tmp.length === 1 ? ("0" + tmp) : tmp;
                    }

                    if (updName) name = reader.getStringUTF8();
                    if (updSkin) skin = reader.getStringUTF8();

                    if (node) {
                        var dt = (time - node.timeStamp) / 120;
                        node.setPos(x, y, dt);
                        node.setSize(size, dt);
                        color && (node.setColor(color));
                        name && (node.setName(name));
                        skin && (node.skin = skin);
                    } else {
                        node = new Cell(id, x, y, size, name || "", color || "#FFFFFF", skin || "", time, flags);
                        nodesID[id] = node;
                        nodes.push(node);
                    }
                }

                // Dissapear records
                count = reader.getUint16();
                for (i = 0; i < count; i++) {
                    killed = reader.getUint32();
                    if (killed !== 0) nodesID[killed].destroy();
                }
                break;
            default:
                log.err("Got unexpected packet ID ")
                Disconnect();
        }
    }

    function SendChat(a) {
        Connect(a);
    }

    function WsError(e) {
        log.warn("Connection error");
        log.debug(e);
    }

    function WsClose() {
        log.info("Disconnected");
        Disconnect();
        setTimeout(function() {
            if (ws) if (ws.readyState === 1) return;
            Connect(CONNECT_TO);
        }, (disconnectDelay *= 1.5) * 1000);
    }

    function WsSend(data) {
        if (!ws) return;
        if (data.build) ws.send(data.build());
        else ws.send(data);
    }

    function Play() {
        var writer = new Writer(true);
        writer.setUint8(0x00);
        writer.setStringUTF8(userName);
        WsSend(writer);
    }

    function SendMouseMove(x, y) {
        if (!ws) return;
        if (ws.readyState !== 1) return; // Still connecting
        var writer = new Writer(true);
        writer.setUint8(0x10);
        writer.setUint32(x);
        writer.setUint32(y);
        writer._b.push(0, 0, 0, 0);
        WsSend(writer);
    }

    // Game variables
    var nodesID = { },
        nodes = [],
        myNodes = [],
        leaderboard = [],
        leaderboardType = -1, // -1 - Not set, 48 - Text list, 49 - FFA list, 50 - Pie chart
        centerX = 0,
        centerY = 0,
        _cX, _cY, // Spectate packet X & Y
        rawMouseX = 0,
        rawMouseY = 0,
        border = BORDER_DEFAULT,
        knownSkins = [],
        loadedSkins = [],
        drawZoom = 1,
        mouseZoom = 1,
        userName = "",
        // Red Green Blue Yellow Cyan Magenta Orange
        teamColors = ["#FF3333", "#33FF33", "#3333FF", "#FFFF33", "#33FFFF", "#FF33FF", "#FF8833"],
        gameType = -1; // Given at SetBorder packet
        serverName = "Realm of emptiness", // Given at SetBorder packet
        chatText = "",
        _sizeChange = false,
        isTyping = function() {
            return document.activeElement === chatBox;
        },
        mainCanvas = null,
        mainCtx = null,
        chatBox = null,
        lastDrawTime = Date.now(),
        escOverlay = true,
        fps = 0,
        pressed = {
            space: false,
            w: false,
            e: false,
            r: false,
            t: false,
            p: false,
            q: false,
            esc: false
        };

    // Client variables
    var settings = {
        touchable: 'createTouch' in document,
        showMass: false,
        showNames: true,
        showLeaderboard: true,
        showChat: true,
        showGrid: true,
        showColor: true,
        showSkins: true,
        darkTheme: false,
        fastRenderMax: 0.4,
        maxScore: 0
    };

    // Load local storage
    if (null != wHandle.localStorage) {
        wjQuery(window).load(function() {
            wjQuery(".save").each(function() {
                var id = $(this).data("box-id");
                var value = wHandle.localStorage.getItem("checkbox-" + id);
                if (value && value == "true" && 0 != id) {
                    $(this).prop("checked", "true");
                    $(this).trigger("change");
                } else if (id == 0 && value != null) {
                    $(this).val(value);
                }
            });
            wjQuery(".save").change(function() {
                var id = $(this).data('box-id');
                var value = (id == 0) ? $(this).val() : $(this).prop('checked');
                wHandle.localStorage.setItem("checkbox-" + id, value);
            });
        });
        if (null == wHandle.localStorage.AB8) {
            wHandle.localStorage.AB8 = ~~(100 * Math.random());
        }
    }

    // Load known skin list
    wjQuery.ajax({
        type: "POST",
        dataType: "json",
        url: "checkdir.php",
        data: {
            "action": "getSkins"
        },
        success: function(data) {
            response = JSON.parse(data["names"]);
            for (var i = 0; i < response.length; i++) {
                if (-1 == knownSkins.indexOf(response[i])) {
                    knownSkins.push(response[i]);
                }
            }
        }
    });

    function hideESCOverlay() {
        escOverlay = false;
        wjQuery("#overlays").hide();
    }

    function showESCOverlay(arg) {
        escOverlay = true;
        userNickName = null;
        wjQuery("#overlays").fadeIn(350);
    }

    function loadInit() {
        mainCanvas = document.getElementById('canvas');
        mainCtx = mainCanvas.getContext('2d');
        chatBox = document.getElementById("chat_textbox");
        // wHandle functions
        function handleWheel(event) {
            mouseZoom *= Math.pow(.9, event.wheelDelta / -120 || event.detail || 0);
            1 > mouseZoom && (mouseZoom = 1);
            mouseZoom > 4 / drawZoom && (mouseZoom = 4 / drawZoom);
        }
        // Mouse wheel
        if (/firefox/i.test(navigator.userAgent)) {
            document.addEventListener("DOMMouseScroll", handleWheel, false);
        } else {
            document.body.onmousewheel = handleWheel;
        }
        wHandle.onkeydown = function(event) {
            switch (event.keyCode) {
                case 13: // enter
                    if (isTyping() && settings.showChat) {
                        chatBox.blur();
                        var chattxt = chatBox.value;
                        if (chattxt.length > 0) SendChat(chattxt);
                        chatBox.value = "";
                    } else if (settings.showChat) {
                        if (!escOverlay) chatBox.focus();
                    }
                    break;
                case 32: // space
                    if (isTyping()) break;
                    WsSend(UINT8_CACHE[17]);
                    break;
                case 87: // W
                    if (isTyping()) break;
                    WsSend(UINT8_CACHE[21]);
                    break;
                case 81: // Q
                    if (isTyping()) break;
                    WsSend(UINT8_CACHE[18]);
                    break;
                case 69: // E
                    if (isTyping()) break;
                    WsSend(UINT8_CACHE[22]);
                    break;
                case 82: // R
                    if (isTyping()) break;
                    WsSend(UINT8_CACHE[23]);
                    break;
                case 84: // T
                    if (isTyping()) break;
                    WsSend(UINT8_CACHE[24]);
                    break;
                case 80: // P
                    if (isTyping()) break;
                    WsSend(UINT8_CACHE[25]);
                    break;
                case 27: // esc
                    if (pressed.esc) break;
                    pressed.esc = true;
                    if (!escOverlay) showESCOverlay();
                    else hideESCOverlay();
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
                    if (pressed.q) WsSend(UINT8_CACHE[19]);
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
                case 27:
                    pressed.esc = false;
                    break;
            }
        }
        mainCanvas.onmousemove = function(event) {
            rawMouseX = event.clientX;
            rawMouseY = event.clientY;
        };
        if (window.requestAnimationFrame) {
            USE_WRAF = true;
            window.requestAnimationFrame(drawLoop);
        } else {
            setInterval(drawLoop, 1E3 / FPS_MAXIMUM);
        }
        setInterval(function() {
            fps = 0;
        }, 1000);
        setInterval(function() {
            // Mouse update
            SendMouseMove((rawMouseX - mainCanvas.width / 2) / drawZoom + centerX,
                (rawMouseY - mainCanvas.height / 2) / drawZoom + centerY);
        }, 40);
        log.info("Loaded, took " + (Date.now() - LOAD_START) + " ms");
    }

    function drawLoop() {
        draw();
        if (USE_WRAF) window.requestAnimationFrame(drawLoop);
    }

    function draw() {
        // Zoom update
        for (var newdrawZoom = 0, i = 0, l = myNodes.length; i < l; i++) newdrawZoom += myNodes[i].size;
        newdrawZoom = Math.pow(Math.min(64 / newdrawZoom, 1), .4) * viewMultiplier();
        drawZoom = (9 * drawZoom + newdrawZoom) / 10;

        var canvasWidth = mainCanvas.width,
            canvasHeight = mainCanvas.height;

        if (0 < myNodes.length) {
            centerX = centerY = 0;
            for (var i = 0, l = myNodes.length, n; i < l; i++) {
                centerX += (n = myNodes[i]).x / l;
                centerY += n.y / l;
            }
        } else if (_cX && _cY) {
            centerX += (cX - centerX) * 0.11;
            centerY += (cY - centerY) * 0.11;
        }

        mainCtx.clearRect(0, 0, canvasWidth, canvasHeight);

        /*mainCtx.scale(drawZoom, drawZoom);

        // Draw grid
        drawGrid();

        mainCtx.translate(canvasWidth / 2 - centerX, canvasHeight / 2 - centerY);*/

        mainCtx.save();
        mainCtx.lineWidth = 5;
        mainCtx.strokeStyle = "#000000";
        mainCtx.beginPath();
        mainCtx.moveTo(100, 100);
        mainCtx.lineTo(200, 200);
        mainCtx.closePath();
        mainCtx.stroke();
        mainCtx.restore();

        var dr = Date.now();
        lastDrawTime = dr;
    }

    function viewMultiplier() {
        var ratio;
        ratio = Math.max(mainCanvas.height / 1080, mainCanvas.width / 1920);
        return ratio * mouseZoom;
    }

    function drawGrid() {
        if (!settings.drawGrid) return;
        mainCtx.fillStyle = showDarkTheme ? "#111111" : "#F2FBFF";
        mainCtx.fillRect(0, 0, canvasWidth, canvasHeight);
        mainCtx.save();
        mainCtx.strokeStyle = showDarkTheme ? "#AAAAAA" : "#000000";
        mainCtx.globalAlpha = .2;
        var a = mainCanvas.width / viewZoom,
            b = mainCanvas.height / viewZoom;
        for (var c = border.left; c < a; c += 50) {
            mainCtx.moveTo(c, 0);
            mainCtx.lineTo(c, b);
        }
        for (c = border.top; c < b; c += 50) {
            mainCtx.moveTo(0, c);
            mainCtx.lineTo(a, c);
        }
        mainCtx.stroke();
        mainCtx.restore();
    }

    function Cell(id, x, y, size, name, color, skin, tick, flags) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.size = size;
        this.setName(name);
        this.setColor(color);
        this.skin = skin;
        this.timeStamp = tick;
        this.nUpd = 0;
        if (flags) {
            this.isEjected = flags & 0x20;
            this.isVirus = flags & 0x01;
            this.isAgitated = flags & 0x10;
        }
    }

    Cell.prototype = {
        destroyed: false,
        id: 0,
        x: 0,
        y: 0,
        size: 0,
        name: 0,
        color: "#FFFFFF",
        skin: "",
        timeStamp: -1,
        nx: 0,
        ny: 0,
        nsize: 0,
        isEjected: false,
        isPellet: false,
        isVirus: false,
        isAgitated: false,
        strokeColor: "#AAAAAA",
        _nameChanged: false,
        _nameTxt: null,
        _massTxt: null,
        setPos: function(x, y, dt) {
            this.x += (x - this.x) * dt;
            this.y += (y - this.y) * dt;
            this.nx = x;
            this.ny = y;
        },
        setSize: function(size, dt) {
            this.size += (size - this.size) * dt;
            this.nsize = size;
        },
        setName: function(name) {
            this._nameChanged = true;
            this.name = name;
        },
        setColor: function(color) {
            this.color = color;
            var r = (~~(parseInt(color.substr(1, 2), 16) * 0.9)).toString(16),
                g = (~~(parseInt(color.substr(3, 2), 16) * 0.9)).toString(16),
                b = (~~(parseInt(color.substr(5, 2), 16) * 0.9)).toString(16);
            if (r.length == 1) r = "0" + r;
            if (g.length == 1) g = "0" + g;
            if (b.length == 1) b = "0" + b;
            this.strokeColor = "#" + r + g + b;
        },
        destroy: function() {
            delete nodesID[this.id];
            nodes.remove(this);
            myNodes.remove(this.id);
            this.destroyed = true;
        },
        shouldRender: function() {

        },
        draw: function() {
            mainCtx.save();
            mainCtx.lineWidth = 5;
            mainCtx.lineJoin = "round";

            mainCtx.restore();
        }
    };

    wHandle.setserver = function(arg) {
        if (CONNECT_TO != arg) {
            Disconnect();
            Connect(CONNECT_TO = arg);
        }
    };
    wHandle.setDarkTheme = function(a) {
        settings.darkTheme = a;
    };
    wHandle.setShowMass = function(a) {
        settings.showMass = a;
    };
    wHandle.setSkins = function(a) {
        settings.showSkins = a;
    };
    wHandle.setColors = function(a) {
        settings.showColor = a;
    };
    wHandle.setNames = function(a) {
        settings.showNames = a;
    };
    wHandle.setSmooth = function(a) {
        settings.fastRenderMax = a ? 1 : 0.4;
    };
    wHandle.setChatHide = function(a) {
        settings.showChat = a;
    };

    wHandle.onload = loadInit;
})(window, window.jQuery);
