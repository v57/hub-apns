import { ApnsClient, Notification, type NotificationOptions } from 'apns2'
import { Service } from 'hub-service'

interface Key {
  name: string
  signingKey: string
  team: string
  keyId: string
  defaultTopic: string
}

let clients = new Map<string, ApnsClient>()
function addClient(key: Key, production: boolean) {
  const { team, keyId, signingKey, defaultTopic, name } = key
  const client = new ApnsClient({
    host: production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com',
    team,
    keyId,
    signingKey,
    defaultTopic,
    requestTimeout: 0,
    keepAlive: true,
  })
  clients.set(`${name}/${production ? 'prod' : 'dev'}`, client)
}
async function loadKeys() {
  let json: Key[] = await Bun.file('./keys.json').json()
  json.forEach(key => {
    addClient(key, true)
    addClient(key, false)
  })
}

interface NotificationBody extends NotificationOptions {
  token: string
}
interface SendRequest {
  service: string
  body: NotificationBody
}
interface SendManyRequest {
  service: string
  body: NotificationBody[]
}

try {
  await loadKeys()
} catch {
  console.log('keys.json file not found')
}
new Service()
  .post('apns/send', async (body: SendRequest) => {
    let client = clients.get(body.service)
    if (!client) throw 'notification service not found'
    await client.send(new Notification(body.body.token, body.body))
  })
  .post('apns/send/many', async (body: SendManyRequest) => {
    let client = clients.get(body.service)
    if (!client) throw 'notification service not found'
    let tokens = new Set<string>()
    let notifications = []
    for (const info of body.body) {
      if (tokens.has(info.token)) continue
      tokens.add(info.token)
      notifications.push(new Notification(info.token, info))
    }
    if (!notifications.length) return
    await client.sendMany(notifications)
  })
  .start()
