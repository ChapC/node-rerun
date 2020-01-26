//This function will be stringified and injected into the graphics JS files
const initRerunReference = () => {
    window.rerun = { version: 0.1 }

    console.info("[node-rerun] Version " + window.rerun.version);

    let ws = new WebSocket('ws://' + localIP + ":8080/graphicEvents");

    ws.addEventListener('open', () => {
        console.info("[node-rerun] Connected to node-rerun server at " + localIP);      
    });
    ws.addEventListener('error', (event) => console.error("[node-rerun] Lost connection to rerun server: ", event));
    ws.addEventListener('message', (event) => {
        let message = event.data;
        let serverEvent = JSON.parse(message);
        console.info('[node-rerun] Event from server: ' + serverEvent.name);

        if (serverEvent.name in window.rerun.eventCallbacks) {
            window.rerun.eventCallbacks[serverEvent.name].forEach((callback) => callback(serverEvent));
        }
    });

    window.rerun.eventCallbacks = {};
    window.rerun.setTimings = setTimings;
    window.rerun.on = attachEventCallback;

    function setTimings(timingsMap) {
        let timingsObj = {
            sourceGraphic: myGraphicsLayerName, type: 'timings', timingsMap: timingsMap
        };
        ws.send(JSON.stringify(timingsObj));
    }

    function attachEventCallback(event, callback) {
        if (event in window.rerun.eventCallbacks) {
            window.rerun.eventCallbacks[event].append(callback);
        } else {
            window.rerun.eventCallbacks[event] = [callback];
        }
    }
}
//TODO: It'd be cool if we could use wss://, but I think the graphics webpages would complain about self-signed

module.exports = {
    script: initRerunReference
}