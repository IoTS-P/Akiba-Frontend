<template>
  <div class="query">
    <div class="query-input">
      <div class="form-group">
        <label>Instance (optional)</label>
        <input v-model="instanceName" placeholder="Instance name" />
      </div>
      <div class="form-group">
        <label>SQL Query</label>
        <textarea v-model="sql" placeholder="SELECT ..." rows="5"></textarea>
      </div>
      <button @click="executeQuery" :disabled="loading || !sql.trim()">Execute</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading" class="loading">Executing...</div>
    <div v-else-if="result" class="result">
      <div class="result-info">
        <span>{{ result.rows.length }} rows</span>
        <span>{{ result.columns.length }} columns</span>
      </div>
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th v-for="col in result.columns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in result.rows" :key="i">
              <td v-for="(cell, j) in row" :key="j">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { queryApi } from '@/services/api'
import type { QueryResponse } from '@/types'

const sql = ref('')
const instanceName = ref('')
const result = ref<QueryResponse | null>(null)
const loading = ref(false)
const error = ref('')

async function executeQuery() {
  if (!sql.value.trim()) return
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const response = await queryApi.execute(
      sql.value,
      instanceName.value || undefined
    )
    result.value = response.data
  } catch (e: any) {
    error.value = e.response?.data?.error || 'Query failed'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.query {
  background: #fff;
  padding: 24px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.query-input {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
}

.form-group input,
.form-group textarea {
  padding: 12px 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: monospace;
}

.form-group textarea {
  resize: vertical;
}

.query-input button {
  align-self: flex-start;
  padding: 12px 24px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.query-input button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  padding: 12px;
  background: #ffebee;
  color: #d32f2f;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 16px;
}

.loading {
  text-align: center;
  padding: 20px;
  color: #999;
}

.result-info {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #666;
}

.table-wrapper {
  overflow-x: auto;
  border: 1px solid #eee;
  border-radius: 6px;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th, .table td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid #eee;
  font-size: 13px;
}

.table th {
  font-weight: 600;
  background: #f8f9fa;
  color: #666;
}

.table td {
  font-family: monospace;
}
</style>