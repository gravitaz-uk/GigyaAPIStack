let def = ()=>'default'
let tim = require('./router')
var router = new tim.Router(def)
router.post('/fred', (e,c)=>'fred')
router.handle({httpMethod: 'POST', path: '/fred'})