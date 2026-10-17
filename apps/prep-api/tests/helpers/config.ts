import { readConfig } from '../../src/config.ts'
import { INTERNAL_KEY } from '../../../prep-harness/tests/helpers/host.ts'
import { TEST_KEY } from './db.ts'

process.env.NO_PROXY = '127.0.0.1,localhost'
process.env.no_proxy = '127.0.0.1,localhost'

/** 测试 app 的通用配置（鉴权开启，harness 地址缺省指向不可达端口，假模型） */
export function prepConfig(env: Record<string, string>) {
  return readConfig({
    ...process.env, OIDC_CLIENT_ID: 'maolab-test', OIDC_CLIENT_SECRET: 'secret', OIDC_AUTHORITY: 'https://gateway.example.com', SECRET_ENCRYPTION_KEY: TEST_KEY, PORTAL_BASE_URL: '',
    YUNYI_HARNESS_URL: 'http://127.0.0.1:9', YUNYI_INTERNAL_KEY: INTERNAL_KEY,
    YUNYI_TURN_PROVIDER: 'fake', YUNYI_TURN_MODEL: 'fake-1',
    ...env,
  })
}
