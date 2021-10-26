import * as bunyan from 'bunyan'
import moment from 'moment'
import { Stream } from 'stream'
import chalk, { Chalk } from 'chalk'
import { isArray, isPlainObject, isEmpty, omit, padStart, findIndex, defaults } from 'lodash'

import { inspect } from 'util'

export type BunyanElegantConfig = {
  timestampFormat?: string
  colors?: {
    trace: string
    debug: string
    info: string
    warn: string
    error: string
    fatal: string
  }
}

export default class BunyanElegant extends Stream {
  config: Required<BunyanElegantConfig>
  constructor(config: BunyanElegantConfig = {}) {
    super()
    const defaultConfig: Required<BunyanElegantConfig> = {
      timestampFormat: 'HH:mm:ss',
      colors: {
        trace: '#A9A9A9',
        debug: '#808080',
        info: '#00FFFF',
        warn: '#FFA500',
        error: '#FF0000',
        fatal: '#FF0000',
      },
    }
    this.config = defaults(config, defaultConfig)
  }

  write(data: any) {
    this.emit('data', this.format(JSON.parse(data)))
  }

  end() {
    this.emit('end')
  }

  format(data: { msg: any; level: string }) {
    const { level, msg } = data

    const levelName = bunyan.nameFromLevel[level]
    const colorHex = this.config.colors[levelName]
    const color = chalk.hex(colorHex)
    const bold = color.bold

    // create message (array)
    const time = moment().format(this.config.timestampFormat)
    const levelText = `${bold('[')}${color(levelName.toUpperCase())}${bold(']')}`
    const spacing = padStart('', 5 - levelName.length)
    const message = [`${bold('[')}${time}${bold(']')}`, `${spacing} `, levelText, ` ${color.bold(msg)}`]

    // format the metdata, if any, and push to message array
    const meta = omit(data, ['hostname', 'tags', 'pid', 'level', 'msg', 'time', 'v', 'name', 'environment'])
    if (isPlainObject(meta) && !isEmpty(meta)) {
      const delimiterText = `${padStart('', 10)}${spacing} ${levelText} `
      const metaText = formatMeta(color, meta, delimiterText)
      message.push(metaText)
    }

    return [...message, '\n'].join('')
  }
}

function getObjectDepth(obj): number {
  const matches = JSON.stringify(obj)
    .replace(/(["'])((?:(?=(?:(\\))*)\3.|.)*?)\1/g, '')
    .match(/^((?:\{[^}]*)+)/)
  if (matches && matches.length > 1) return matches[1].split('{').length - 1
  else return 0
}

const dotted = (obj, keys: string[] = []) => {
  return Object.keys(obj).reduce((acc, key) => {
    return Object.assign(
      acc,
      isPlainObject(obj[key]) || (isArray(obj[key]) && findIndex(obj[key], isPlainObject) !== -1)
        ? dotted(obj[key], keys.concat(key))
        : { [keys.concat(key).join('.')]: isArray(obj[key]) ? JSON.stringify(obj[key]) : obj[key] },
    )
  }, {})
}

function formatObject(color: Chalk, parent: string, meta: any): string[] {
  const depth = getObjectDepth(meta)
  if (depth >= 3) {
    return [
      `${parent} = ${color.bold('⇩')}`,
      color.bold('━━━━━━━━━━━━━━━━━━━━'),
      inspect(meta, { depth: 10, colors: true })
        .split('\n')
        .join('\n' + padStart(' ', 21)),
      color.bold('━━━━━━━━━━━━━━━━━━━━'),
    ]
  } else {
    const dotObject = dotted(meta)
    return Object.keys(dotObject).map(key => {
      const val = dotObject[key]
      return `${parent ? parent + '.' : ''}${key} = ${color.bold(val)}`
    })
  }
}

function formatMeta(color: Chalk, meta: any, delimiterText = ' '): string {
  const message: string[] = []
  const depth = getObjectDepth(meta)
  if (JSON.stringify(meta).length < 100 && depth < 3) {
    message.push(color.bold('  ⇨ [ ') + formatObject(color, '', meta).join(' ') + color.bold(' ]'))
  } else {
    message.push('\n')
    message.push(delimiterText + color.bold('↳'))
    for (const [key, value] of Object.entries(meta)) {
      if (isPlainObject(value) || (isArray(value) && findIndex(value, isPlainObject) !== -1)) {
        message.push('\n')
        message.push(delimiterText + '  ' + formatObject(color, key, value).join('\n' + delimiterText + '  '))
      } else {
        message.push('\n')
        message.push(`${delimiterText}  ${key} = ${color.bold(value)}`)
      }
    }
  }

  return message.join('')
}
