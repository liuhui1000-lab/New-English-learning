// 数据导出脚本 - 使用 Supabase Client
// 运行: node export_data.js

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Preview 环境配置
const PREVIEW_URL = 'https://your-preview-project.supabase.co'
const PREVIEW_KEY = 'your-preview-anon-key'

const supabase = createClient(PREVIEW_URL, PREVIEW_KEY)

async function exportToCSV() {
    console.log('开始导出数据...')

    // 1. 导出 import_history（清空 uploaded_by）
    console.log('[1/2] 导出 import_history...')
    const { data: importHistory, error: error1 } = await supabase
        .from('import_history')
        .select('id, filename, import_date, question_count')
        .order('import_date')

    if (error1) {
        console.error('导出 import_history 失败:', error1)
        return
    }

    // 转换为 CSV
    const importHistoryCSV = convertToCSV(importHistory, ['id', 'filename', 'import_date', 'question_count', 'uploaded_by'])
    fs.writeFileSync('import_history.csv', importHistoryCSV, 'utf8')
    console.log(`✓ 导出 ${importHistory.length} 条 import_history 记录`)

    // 2. 导出 questions
    console.log('[2/2] 导出 questions...')
    let allQuestions = []
    let page = 0
    const pageSize = 1000

    while (true) {
        const { data, error } = await supabase
            .from('questions')
            .select('*')
            .order('created_at')
            .range(page * pageSize, (page + 1) * pageSize - 1)

        if (error) {
            console.error('导出 questions 失败:', error)
            return
        }

        if (!data || data.length === 0) break

        allQuestions = allQuestions.concat(data)
        console.log(`  已导出 ${allQuestions.length} 条...`)
        page++
    }

    const questionsCSV = convertToCSV(allQuestions)
    fs.writeFileSync('questions.csv', questionsCSV, 'utf8')
    console.log(`✓ 导出 ${allQuestions.length} 条 questions 记录`)

    console.log('\n导出完成！文件保存在当前目录：')
    console.log('  - import_history.csv')
    console.log('  - questions.csv')
}

function convertToCSV(data, customHeaders = null) {
    if (!data || data.length === 0) return ''

    const headers = customHeaders || Object.keys(data[0])
    const rows = data.map(row => {
        return headers.map(header => {
            const value = customHeaders && header === 'uploaded_by' ? null : row[header]
            if (value === null || value === undefined) return ''
            if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`
            }
            return value
        }).join(',')
    })

    return [headers.join(','), ...rows].join('\n')
}

exportToCSV()
