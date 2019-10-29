const METHODS = {ANY: 'ANY', POST: 'POST', GET: 'GET', PUT: 'PUT', DELETE: 'DELETE', UPDATE: 'UPDATE', PATCH: 'PATCH'}
// lightweight request router for lambda
class Route {
    constructor(method, path, handler) {
        this.method = method;
        this.path = path;
        this.handler = handler;
    }
    handle(event, context) {
        handler(event, context);
    }
    resolve(event, context) {
        return ((event.httpMethod==this.method || this.method==METHODS.ANY) && event.path==this.path);
    }
}

// where multiple paths map to same handler you can skip the handler as it will default to the last one specified
class Router {
    constructor(initialHandler) {
        this.lastHandler = initialHandler;
        this.reset();
    }
    reset() {
        this.routes=[];
    }
    add(route) {
        if (route instanceof Route) {
            if (!route.handler) {
                route.handler=this.lastHandler;
            } else {
                this.lastHandler=route.handler; // default handler is last specified handler
            }
            this.routes.push(route)
        } else {
            throw new Error('Trying to add non route to router');
        }
        return this;
    }
    use(path, handler, method = METHODS.ANY) {
        return this.add(new Route(method, path, handler));
    }
    post(path, handler) {
        return this.use(path, handler, METHODS.POST);
    }
    get (path, handler) {
        return this.use(path, handler, METHODS.GET);
    }
    put (path, handler) {
        return this.use(path, handler, METHODS.PUT);
    }
    delete (path, handler) {
        return this.use(path, handler, METHODS.DELETE);
    }
    update (path, handler) {
        return this.use(path, handler, METHODS.UPDATE);
    }
    patch (path, handler) {
        return this.use(path, handler, METHODS.PATCH);
    }
    find(event, context) {
        return this.routes.find(r=>r.resolve(event, context))
    }
    handle(event, context) {
        let route = this.find(event, context);
        if (route) {
            return route.handler(event, context);
        } else {
            return {
                statusCode: 404,
                body: { "err": `unknown ${event.httpMethod} endpoint ${event.path}` }
            };
        }
    }
}
module.exports = {Route, Router};