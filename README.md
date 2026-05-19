# Akiba Frontend

Vue 3 前端项目，用于管理 Akiba Framework Server。

## 安装

```bash
npm install
```

## 开发

```bash
npm run dev
```

访问 http://localhost:5173

## 构建

```bash
npm run build
```

## API 接口

前端代理配置：`/api` → `http://localhost:8080`

### 认证 `/api/auth`

| 方法 | 路径 | 描述 | 请求体 |
|------|------|------|--------|
| POST | `/auth/register` | 注册 | `{"username": "", "password": ""}` |
| POST | `/auth/login` | 登录 | `{"username": "", "password": ""}` |
| POST | `/auth/logout` | 登出 | - |
| GET | `/auth/me` | 当前用户 | - |

登录成功后 Token 存储于 localStorage。

### 实例 `/api/instances`

| 方法 | 路径 | 描述 | 请求体 |
|------|------|------|--------|
| GET | `/instances` | 列表 | - |
| POST | `/instances/create` | 创建 | `{"name": ""}` |
| POST | `/instances/delete` | 删除 | `{"instanceName": ""}` |
| POST | `/instances/start` | 启动 | `{"instanceName": ""}` |
| POST | `/instances/shutdown` | 关机 | `{"instanceName": ""}` |
| POST | `/instances/backup` | 备份 | `{"instanceName": ""}` |

### 脚本 `/api/scripts`

| 方法 | 路径 | 描述 | 请求体 |
|------|------|------|--------|
| GET | `/scripts` | 列表(最近100条) | - |
| GET | `/scripts/{id}` | 详情 | - |
| POST | `/scripts/run` | 执行 | `{"name": "", "code": ""}` |
| DELETE | `/scripts/{id}` | 删除 | - |

### 工作流 `/api/workflow`

| 方法 | 路径 | 描述 | 请求体 |
|------|------|------|--------|
| POST | `/workflow/start` | 启动 | `{"instanceName": "", "configPath": "", "threads": 1}` |
| POST | `/workflow/stop/{workflowId}` | 停止 | - |
| GET | `/workflow/status/{workflowId}` | 状态 | - |
| GET | `/workflow/running` | 运行中 | - |
| GET | `/workflow/history` | 历史 | - |

### 文件 `/api/files`

| 方法 | 路径 | 描述 | 请求体 |
|------|------|------|--------|
| POST | `/files/import` | 导入 | `{"instanceName": "", "files": []}` |
| GET | `/files` | 列表 | - |
| DELETE | `/files` | 删除 | `{"instanceName": "", "fileIds": []}` |

### 查询 `/api/query`

| 方法 | 路径 | 描述 | 请求体 |
|------|------|------|--------|
| POST | `/query` | 执行SQL | `{"sql": "", "instanceName": ""}` |
| GET | `/query/history` | 历史 | - |

**注意**: 仅支持 SELECT 查询。

### 健康检查

| 方法 | 路径 |
|------|------|
| GET | `/api/health` |

## 页面说明

- **Dashboard** - 统计概览：实例数、脚本数、工作流数、运行中工作流
- **Instances** - 实例管理：创建、启动、关机、备份、删除
- **Scripts** - 脚本管理：创建 Bash 脚本、执行、查看输出、删除
- **Workflows** - 工作流管理：启动工作流、停止、监控进度
- **Files** - 文件管理：查看和删除已导入文件
- **Query** - SQL 查询：执行 SELECT 查询并查看结果

## 技术栈

- Vue 3 (Composition API)
- TypeScript
- Vue Router
- Pinia (状态管理)
- Axios
- Vite