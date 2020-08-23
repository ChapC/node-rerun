import { RerunStateObject } from './index';
import { WSConnection } from './helpers/WebsocketConnection';
import WebSocket from 'ws';

/**
 * A singleton storing all active control panel websockets. 
 * Components can send data to control panels and register request handlers through this class.
 */
export default class ControlPanelHandler {
    private constructor() { }

    private static instance: ControlPanelHandler = new ControlPanelHandler();
    
    private rerunState: RerunStateObject;
    static setRerunState(state: RerunStateObject) {
        this.instance.rerunState = state;
    }

    static getInstance() : ControlPanelHandler {
        return this.instance;
    }

    private connectedControlPanels : WSConnection[] = [];

    /**
     * Mark a websocket as a control panel socket, allowing it to send and receive control panel messages.
     * @param ws The websocket to add
     */
    acceptWebsocket(ws: WebSocket) {
        let wsConn = new WSConnection(ws);
        this.connectedControlPanels.push(wsConn);

        wsConn.on('close', () => this.connectedControlPanels.splice(this.connectedControlPanels.indexOf(wsConn), 1));

        //Attach all the stored request handlers onto this socket
        Object.keys(this.requestHandlers).forEach(requestName => this.requestHandlers[requestName](wsConn));
    }

    private requestHandlers : {[requestName: string] : (ws: WSConnection) => void} = {};
    /**
     * Register a handler for a control panel request. 
     * TRequestData is the type that the request body is expected to conform to. The request will be dropped if the body fails the provided type guard.
     * @param requestName Request to handle
     * @param typeGuard A type guard function to test incoming requests against
     * @param handler Callback to trigger when the request is received
     */
    registerHandler<TRequestData>(requestName: string, typeGuard: (reqData: any) => reqData is TRequestData, handler: WSConnection.WSReqHandler) {
        if (this.requestHandlers[requestName]) {
            console.warn(`There are multiple request handlers registered for the ${requestName} endpoint`);
            return;
        }
        //Attach the handler to all active control panels
        let attachFunction = (ws: WSConnection) => ws.addGuardedRequestHandler<TRequestData>(requestName, typeGuard, handler);
        this.connectedControlPanels.map((ws) => attachFunction(ws));
        //Store the request attach function for future control panel sockets
        this.requestHandlers[requestName] = attachFunction;
    }

    /**
     * Register a handler for a control panel request with no body data.
     * @param requestName Request to handle
     * @param handler Callback to trigger when the request is received
     */
    registerEmptyHandler(requestName: string, handler: () => WSConnection.WSPendingResponse) {
        if (this.requestHandlers[requestName]) {
            console.warn(`There are multiple request handlers registered for the ${requestName} endpoint`);
            return;
        }
        let attachFunction = (ws: WSConnection) => ws.addRequestHandler(requestName, handler);
        this.connectedControlPanels.map(ws => attachFunction(ws));
        this.requestHandlers[requestName] = attachFunction;
    }

    /**
     * Send an alert to all control panels.
     * @param event Name of the event
     * @param data Event content (optional)
     */
    sendAlert(event: string, data?: any) {
        this.connectedControlPanels.forEach(ws => ws.sendAlert(event, data));
    }
}

//Decorators

const RequestMethodStoreKey = Symbol('CPRequestMethodKey');
type StoredRequestMethod = {requestName: string, typeGuard: (reqData: any) => reqData is any}

export function ControlPanelRequest<TRequestData>(requestName: string, typeGuard?: (reqData: any) => reqData is TRequestData) {
    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        //Create (or add to) a map on the prototype storing all this class' registered requests
        target[RequestMethodStoreKey] = target[RequestMethodStoreKey] || new Map(); 
         //ControlPanelListener will access these later
         target[RequestMethodStoreKey].set(propertyKey, {requestName: requestName, typeGuard: typeGuard});
    }
}


export function ControlPanelListener<T extends { new(...args: any[]) : {}}>(Base: T) {
    //Return a new constructor which checks for the RequestMethodStoreKey map and registers any methods decorated with ControlPanelRequest
    return class extends Base {
        constructor(...args: any[]) {
            super(...args);
            const requestMethods = Base.prototype[RequestMethodStoreKey];
            if (requestMethods) {
                requestMethods.forEach((storedMethod: StoredRequestMethod, methodKey: string) => {
                    if (storedMethod.typeGuard) {
                        ControlPanelHandler.getInstance().registerHandler(storedMethod.requestName, storedMethod.typeGuard, (data: any) => (this as any)[methodKey](data));
                    } else {
                        ControlPanelHandler.getInstance().registerEmptyHandler(storedMethod.requestName, () => (this as any)[methodKey]())
                    }
                });
            }
        }
    }
}