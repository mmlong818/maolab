// 课程表的外键指向 account.users：测试库是空库时先建 account schema（core/auth 的 DDL），各测试文件不依赖执行顺序。
import { accountDdl } from '@maolab-core/auth'
import { testPool } from './db.ts'

export default async function setup(): Promise<void> {
  const pool = testPool()
  try {
    await pool.query(accountDdl())
  } finally {
    await pool.end()
  }
}
