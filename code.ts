figma.showUI(__html__, { height: 130, width: 240, title: 'Webcat' })
refreshSelection()
figma.on('selectionchange', refreshSelection)
figma.on('documentchange', refreshSelection)
figma.ui.onmessage = async (message) => {
  if (message.type === 'copy') await actionCopy()
  if (message.type === 'detach') await actionDetach()
}
// Actions
function refreshSelection() {
  const currentSelection = figma.currentPage.selection
  const length = currentSelection.length
  if (length === 0) figma.ui.postMessage({ type: 'no-selection' })
  else if (length > 1) figma.ui.postMessage({ type: 'multiple-selection' })
  else if (currentSelection[0].type !== 'FRAME') figma.ui.postMessage({ type: 'not-frame' })
  else {
    let componentAmount = currentSelection[0].findAllWithCriteria({
      types: ['INSTANCE']
    }).length
    if (componentAmount === 0) figma.ui.postMessage({ type: 'selection', name: currentSelection[0].name })
    else figma.ui.postMessage({ type: 'component-selection', name: currentSelection[0].name, amount: componentAmount })
  }
}
async function actionCopy () {
  const currentSelection = figma.currentPage.selection
  const length = currentSelection.length
  if (length === 0) return
  const data = await buildWebcatCopyable(currentSelection[0])
  figma.ui.postMessage({ type: 'copy', data })
}
async function actionDetach () {
  const currentSelection = figma.currentPage.selection
  if (currentSelection[0].type !== 'FRAME') return
  const instances = currentSelection[0].findAllWithCriteria({
    types: ['INSTANCE']
  })
  instances.forEach((instance) => instance.detachInstance())
  refreshSelection()
}
async function buildWebcatCopyable (base: any) {
  const fns: any = {
    'FRAME': getFrameObj,
    'RECTANGLE': getRectObj,
    'TEXT': getTextObj,
    'VECTOR': getVectorObj,
    'GROUP': getGroupObj
  }
  let rootFn = ((node: any) => ({}))
  if (base.type in fns) rootFn = fns[base.type]
  const elementId = uid()
  let elements: any = {}
  elements[elementId] = {
    children: await mapChildren(base.children),
    ...await rootFn(base)
  }
  return `WEBCAT_COPY_DATA${JSON.stringify({
    elementId,
    elements
  })}`
  async function mapChild (node: any) {
    let fn = ((node: any) => ({}))
    if (node.type in fns) fn = fns[node.type]
    const id = uid()
    const newNode: any = await fn(node)
    elements[id] = {
      children: newNode.el === 'ImgEl' ? null : await mapChildren(node.children),
      ...newNode
    }
    return id
  }
  // Nodes
  async function getFrameObj (node: any) {
    const isAutoLayout = node.layoutMode !== 'NONE'
    if (!isAutoLayout) return getVectorObj(node)
    return {
      el: 'div',
      name: node.name,
      container: true,
      smartStyle: {
        default: {
          ...await getBackgroundStyles(node),
          ...await getBorderStyles(node),
          ...getSizingStylesParent(node),
          ...getContainerStyles(node),
          ...getEffectStyles(node)
        }
      }
    }
  }
  async function getRectObj (node: any) {
    const background = node.fills[0] || {}
    const isImage = background.type === 'IMAGE'
    if (isImage) return getImgObj(node)
    return {
      el: 'div',
      name: node.name,
      container: true,
      smartStyle: {
        default: {
          ...await getBackgroundStyles(node),
          ...await getBorderStyles(node),
          ...getSizingStylesChild(node),
          ...getPositionStyles(node),
          ...getEffectStyles(node)
        }
      }
    }
  }
  async function getImgObj (node: any) {
    const background = node.fills[0] || {}
    const imgBytes = await figma.getImageByHash(background.imageHash)?.getBytesAsync()
    const src = imgBytes ? `data:image/png;base64,${figma.base64Encode(imgBytes)}` : ''
    return {
      el: 'ImgEl',
      name: node.name,
      props: {
        src,
        alt: node.name
      },
      smartStyle: {
        default: {
          ...getSizingStylesChild(node),
          ...await getBorderStyles(node),
          ...getPositionStyles(node),
          ...getEffectStyles(node)
        }
      }
    }
  }
  async function getTextObj (node: any) {
    const textStyles = await getTextStyles(node)
    const boxStyles = {
      ...await getBorderStyles(node),
      ...getSizingStylesText(node),
      ...getPositionStyles(node)
    }
    const nodes = textStyles.map((text: any) => ({
      el: 'span',
      name: text.characters,
      template: text.characters,
      smartStyle: {
        default: {
          ...text.styles
        }
      }
    }))
    if (nodes.length === 1) return {
      ...nodes[0],
      smartStyle: {
        default: {
          ...nodes[0].smartStyle.default,
          ...boxStyles
        }
      }
    }
    return {
      el: 'div',
      name: node.name,
      container: true,
      children: nodes.map((node: any) => {
        const id = uid()
        elements[id] = node
        return id
      }),
      smartStyle: {
        default: {
          ...getSizingStylesText(node),
          ...getPositionStyles(node),
          ...await getBorderStyles(node)
        }
      }
    }
  }
  async function getVectorObj (node: any) {
    const svg: any = await node.exportAsync({ format: 'SVG_STRING' })
    return {
      el: 'ImgEl',
      name: node.name,
      smartStyle: {
        default: {
          ...getSizingStylesChild(node),
          ...getPositionStyles(node)
        }
      },
      props: {
        src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
        alt: node.name
      }
    }
  }
  async function getGroupObj (node: any) {
    return {
      el: 'div',
      name: node.name,
      container: true,
      smartStyle: {
        default: {
          position: 'relative',
          ...getSizingStylesChild(node),
          ...getPositionStyles(node),
          ...getEffectStyles(node)
        }
      }
    }
  }
  // Styles
  function getPositionStyles (node: any) {
    const isRelativeToFrame = node.parent.type === 'FRAME' && node.parent.layoutMode === 'NONE'
    const isAbsolute = node.parent.type === 'GROUP' || isRelativeToFrame
    if (!isAbsolute) return {}
    const { x: childX, y: childY } = node
    const { x: parentX, y: parentY } = isRelativeToFrame ? { x: 0, y: 0 } : node.parent
    const x = childX - parentX
    const y = childY - parentY
    return {
      position: 'absolute',
      left: `${Math.floor(x)}px`,
      top: `${Math.floor(y)}px`
    }
  }
  function getEffectStyles (node: any) {
    return {
      boxShadow: node.effects.map((effect: any) => {
        if (effect.type !== 'DROP_SHADOW') return ''
        const { r, g, b, a } = effect.color
        const color = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`
        const { x, y } = effect.offset
        const { radius } = effect
        return `${x}px ${y}px ${radius}px ${color}`
      }).join(', ') || null
    }
  }
  function getSizingStylesParent (node: any) {
    const nodeDirection = node.layoutMode
    const parentDirection = node.parent.layoutMode
    let dimensions: any = { width: null, height: null }
    let alignSelf, flexGrow
    const primaryStretch = parentDirection === nodeDirection ? node.layoutGrow === 1 : node.layoutAlign === 'STRETCH'
    const counterStretch = parentDirection !== nodeDirection ? node.layoutGrow === 1 : node.layoutAlign === 'STRETCH'
    const primaryProp = nodeDirection === 'HORIZONTAL' ? 'width' : 'height'
    const counterProp = nodeDirection === 'HORIZONTAL' ? 'height' : 'width'
    // Primary axis
    if (primaryStretch) {
      if (parentDirection === nodeDirection) flexGrow = 1
      else alignSelf = 'stretch'
    }
    else if (node.primaryAxisSizingMode === 'FIXED') {
      dimensions[primaryProp] = `${node[primaryProp]}px`
    }
    // Counter axis
    if (counterStretch) {
      if (parentDirection !== nodeDirection) flexGrow = 1
      else alignSelf = 'stretch'
    }
    else if (node.counterAxisSizingMode === 'FIXED') {
      dimensions[counterProp] = `${node[counterProp]}px`
    }
    if (node.parent.type === 'PAGE') {
      dimensions.width = '100%'
      dimensions.height = '100%'
    }
    const { width, height } = dimensions
    return {
      flexGrow,
      alignSelf,
      width,
      height,
      boxSizing: node.strokesIncludedInLayout ? 'border-box' : null
    }
  }
  function getSizingStylesChild (node: any) {
    const parentDirection = node.parent.layoutMode
    let dimensions: any = { width: null, height: null }
    let alignSelf, flexGrow
    const primaryProp = parentDirection === 'HORIZONTAL' ? 'width' : 'height'
    const counterProp = parentDirection === 'HORIZONTAL' ? 'height' : 'width'
    // Flex Grow
    if (node.layoutGrow === 1) {
      flexGrow = 1
    } else {
      dimensions[primaryProp] = `${Math.floor(node[primaryProp])}px`
    }
    // Align Self
    if (node.layoutAlign === 'STRETCH') {
      alignSelf = 'stretch'
    } else {
      dimensions[counterProp] = `${Math.floor(node[counterProp])}px`
    }
    const { width, height } = dimensions
    return {
      flexGrow,
      alignSelf,
      width,
      height,
      boxSizing: node.strokesIncludedInLayout ? 'border-box' : null
    }
  }
  function getSizingStylesText (node: any) {
    const parentDirection = node.parent.layoutMode
    let dimensions: any = { width: null, height: null }
    let alignSelf, flexGrow
    const textAutoResize = node.textAutoResize
    const primaryProp = parentDirection === 'HORIZONTAL' ? 'width' : 'height'
    const counterProp = parentDirection === 'HORIZONTAL' ? 'height' : 'width'
    // Primary axis
    if (textAutoResize.includes(primaryProp.toUpperCase())) { // Autoresize
      dimensions[primaryProp] = null
    } else if (node.layoutGrow === 1) { // Stretch
      flexGrow = 1
    } else { // Fixed
      dimensions[primaryProp] = `${Math.floor(node[primaryProp])}px`
    }
    // Secondary axis
    if (textAutoResize.includes(counterProp.toUpperCase())) { // Autoresize
      dimensions[counterProp] = null
    } else if (node.layoutAlign === 'STRETCH') { // Stretch
      alignSelf = 'stretch'
    } else { // Fixed
      dimensions[counterProp] = `${Math.floor(node[counterProp])}px`
    }
    const { width, height } = dimensions
    return {
      flexGrow,
      alignSelf,
      width,
      height,
      boxSizing: node.strokesIncludedInLayout ? 'border-box' : null
    }
  }
  function getContainerStyles (node: any) {
    const alignMap: any = {
      MIN: 'flex-start',
      CENTER: 'center',
      MAX: 'flex-end',
      STRETCH: null,
      BASELINE: 'baseline'
    }
    const justifyMap: any = {
      MIN: null,
      CENTER: 'center',
      MAX: 'flex-end',
      SPACE_BETWEEN: 'space-between'
    }
    return {
      display: 'flex',
      flexDirection: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
      justifyContent: justifyMap[node.primaryAxisAlignItems],
      alignItems: alignMap[node.counterAxisAlignItems],
      gap: node.itemSpacing && node.primaryAxisAlignItems !== 'SPACE_BETWEEN' ? `${node.itemSpacing}px` : null,
      padding: shorthand(node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft),
      
    }
  }
  async function getBackgroundStyles (node: any) {
    const backgroundScaleDict: any = {
      'FILL': 'cover',
      'FIT': 'contain'
    }
    const background = node.fills[0]
    const backgroundType = background && background.type === 'SOLID' ? 'backgroundColor' : 'backgroundImage'
    const backgroundSize = background && backgroundScaleDict[background.scaleMode] || null
    return {
      [backgroundType]: node.fills[0] ? await getFill(node.fills[0]) : null,
      backgroundSize,
      
    }
  }
  async function getBorderStyles (node: any) {
    const strokeWeight = typeof node.strokeWeight === 'string' ? `${node.strokeWeight}px` : `${node.strokeTopWeight}px ${node.strokeRightWeight}px ${node.strokeBottomWeight}px ${node.strokeLeftWeight}px`
    const cornerRadius = typeof node.cornerRadius === 'string' ? `${node.cornerRadius}px` : `${node.topLeftRadius}px ${node.topRightRadius}px ${node.bottomRightRadius}px ${node.bottomLeftRadius}px`
    return {
      borderWidth: node.strokes[0] ? strokeWeight : null,
      borderColor: node.strokes[0] ? await getFill(node.strokes[0]) : null,
      borderRadius: node.cornerRadius ? cornerRadius : null
    }
  }
  async function getTextStyles (node: any) {
    const segments = node.getStyledTextSegments(['fontName', 'fontSize', 'fills', 'fontWeight', 'textDecoration', 'textCase', 'lineHeight'])
    const styles = await Promise.all(segments.map(async (segment: any) => {
      const decorationMap: any = {
        'STRIKETHROUGH': 'line-through',
        'UNDERLINE': 'underline'
      }
      const caseMap: any = {
        'ORIGINAL': null,
        'UPPER': 'uppercase',
        'LOWER': 'lowercase',
        'TITLE': 'capitalize'
      }
      const alignMap: any = {
        'LEFT': null,
        'RIGHT': 'right',
        'CENTER': 'center',
        'JUSTIFIED': 'justify'
      }
      const lineHeight = getValueWithUnits(segment.lineHeight)
      return {
        characters: segment.characters,
        styles: {
          fontSize: `${segment.fontSize}px`,
          fontWeight: segment.fontWeight === 400 ? null : segment.fontWeight,
          lineHeight: lineHeight === 'auto' ? null : lineHeight,
          fontFamily: segment.fontName.family,
          textDecoration: decorationMap[segment.textDecoration],
          textAlign: alignMap[node.textAlignHorizontal],
          textTransform: caseMap[segment.textCase],
          color: segment.fills[0] ? await getFill(segment.fills[0]) : ''
        }
      }
    }))
    return styles
  }
  // Helpers
  function getValueWithUnits ({ value = 0, unit = 'PIXELS' }) {
    const unitMap: any = {
      'PIXELS': 'px',
      'PERCENT': '%',
      'AUTO': 'auto'
    }
    if (unit === 'AUTO') return 'auto'
    if (!value) return null
    return `${value}${unitMap[unit]}`
  }
  function shorthand (top: any, right: any, bottom: any, left: any) {
    if (top === right && right === bottom && bottom === left) return top ? `${top}px` : null
    if (top === bottom && right === left) return `${top}px ${right}px`
    return `${top}px ${right}px ${bottom}px ${left}px`
  }
  async function getFill (fill: any) {
    if (fill.type === 'SOLID') return `rgba(${Math.floor(fill.color.r * 255)}, ${Math.floor(fill.color.g * 255)}, ${Math.floor(fill.color.b * 255)}, ${Math.round(fill.opacity * 100) / 100})`
    else if (fill.type === 'GRADIENT_LINEAR') return `linear-gradient(${Math.ceil(getAngle(fill.gradientTransform) + 90)}deg, ${fill.gradientStops.map((stop: any) => `rgba(${Math.floor(stop.color.r * 255)}, ${Math.floor(stop.color.g * 255)}, ${Math.floor(stop.color.b * 255)}, ${Math.round(stop.color.a * 100) / 100}) ${Math.round(stop.position * 100)}%`).join(', ')})`
    else if (fill.type === 'IMAGE') {
      const imgBytes = await figma.getImageByHash(fill.imageHash)?.getBytesAsync()
      if (!imgBytes) return ''
      return `url(data:image/png;base64,${figma.base64Encode(imgBytes)})`
    }
    else return ''
  }
  function mapChildren (children: any[] = []) {
    return Promise.all(children
      .filter((child:any) => fns[child.type])
      .map((child: any) => mapChild(child)))
  }
}
// Helpers
function uid (length: number = 12) {
  let result = ''
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const charactersLength = characters.length
  for ( let i = 0; i < length; i++ ) result += characters.charAt(Math.floor(Math.random() * charactersLength))
  return result
}
function getAngle (transform: any) {
  const decomposed = decomposeRelativeTransform(
    transform[0],
    transform[1]
  )
  return (decomposed.rotation * 180) / Math.PI
}
function decomposeRelativeTransform (t1: [number, number, number], t2: [number, number, number]) {
  const a: number = t1[0]
  const b: number = t1[1]
  const c: number = t1[2]
  const d: number = t2[0]
  const e: number = t2[1]
  const f: number = t2[2]

  const delta = a * d - b * c

  const result: {
    translation: [number, number]
    rotation: number
    scale: [number, number]
    skew: [number, number]
  } = {
    translation: [e, f],
    rotation: 0,
    scale: [0, 0],
    skew: [0, 0],
  }
  if (a !== 0 || b !== 0) {
    const r = Math.sqrt(a * a + b * b)
    result.rotation = b > 0 ? Math.acos(a / r) : -Math.acos(a / r)
    result.scale = [r, delta / r]
    result.skew = [Math.atan((a * c + b * d) / (r * r)), 0]
  }
  return result
}
