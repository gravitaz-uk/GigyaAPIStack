// lightweight request router

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
        return ((event.httpMethod==this.method || this.method=='ANY') && event.path==this.path);
    }
}
class Router {
    constructor(initialHandler) {
        this.lastHandler = initialHandler;
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
    use(method, path, handler) {
        return this.add(new Route(method, path, handler));
    }
    post(path, handler) {
        return this.use('POST', path, handler);
    }
    get (path, handler) {
        return this.use('GET', path, handler);
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