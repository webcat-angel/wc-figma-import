"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
figma.showUI(__html__, { height: 130, width: 240, title: 'Webcat' });
refreshSelection();
figma.on('selectionchange', refreshSelection);
figma.on('documentchange', refreshSelection);
figma.ui.onmessage = (message) => __awaiter(void 0, void 0, void 0, function* () {
    if (message.type === 'copy')
        yield actionCopy();
    if (message.type === 'detach')
        yield actionDetach();
});
// Actions
function refreshSelection() {
    const currentSelection = figma.currentPage.selection;
    const length = currentSelection.length;
    if (length === 0)
        figma.ui.postMessage({ type: 'no-selection' });
    else if (length > 1)
        figma.ui.postMessage({ type: 'multiple-selection' });
    else if (currentSelection[0].type !== 'FRAME')
        figma.ui.postMessage({ type: 'not-frame' });
    else {
        let componentAmount = currentSelection[0].findAllWithCriteria({
            types: ['INSTANCE']
        }).length;
        if (componentAmount === 0)
            figma.ui.postMessage({ type: 'selection', name: currentSelection[0].name });
        else
            figma.ui.postMessage({ type: 'component-selection', name: currentSelection[0].name, amount: componentAmount });
    }
}
function actionCopy() {
    return __awaiter(this, void 0, void 0, function* () {
        const currentSelection = figma.currentPage.selection;
        const length = currentSelection.length;
        if (length === 0)
            return;
        const data = yield buildWebcatCopyable(currentSelection[0]);
        figma.ui.postMessage({ type: 'copy', data });
    });
}
function actionDetach() {
    return __awaiter(this, void 0, void 0, function* () {
        const currentSelection = figma.currentPage.selection;
        if (currentSelection[0].type !== 'FRAME')
            return;
        const instances = currentSelection[0].findAllWithCriteria({
            types: ['INSTANCE']
        });
        instances.forEach((instance) => instance.detachInstance());
        refreshSelection();
    });
}
function buildWebcatCopyable(base) {
    return __awaiter(this, void 0, void 0, function* () {
        const fns = {
            'FRAME': getFrameObj,
            'RECTANGLE': getRectObj,
            'TEXT': getTextObj,
            'VECTOR': getVectorObj,
            'GROUP': getGroupObj
        };
        let rootFn = ((node) => ({}));
        if (base.type in fns)
            rootFn = fns[base.type];
        const elementId = uid();
        let elements = {};
        elements[elementId] = Object.assign({ children: yield mapChildren(base.children) }, yield rootFn(base));
        return `WEBCAT_COPY_DATA${JSON.stringify({
            elementId,
            elements
        })}`;
        function mapChild(node) {
            return __awaiter(this, void 0, void 0, function* () {
                let fn = ((node) => ({}));
                if (node.type in fns)
                    fn = fns[node.type];
                const id = uid();
                const newNode = yield fn(node);
                elements[id] = Object.assign({ children: newNode.el === 'ImgEl' ? null : yield mapChildren(node.children) }, newNode);
                return id;
            });
        }
        // Nodes
        function getFrameObj(node) {
            return __awaiter(this, void 0, void 0, function* () {
                const isAutoLayout = node.layoutMode !== 'NONE';
                if (!isAutoLayout)
                    return getVectorObj(node);
                return {
                    el: 'div',
                    name: node.name,
                    container: true,
                    smartStyle: {
                        default: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, yield getBackgroundStyles(node)), yield getBorderStyles(node)), getSizingStylesParent(node)), getContainerStyles(node)), getEffectStyles(node))
                    }
                };
            });
        }
        function getRectObj(node) {
            return __awaiter(this, void 0, void 0, function* () {
                const background = node.fills[0] || {};
                const isImage = background.type === 'IMAGE';
                if (isImage)
                    return getImgObj(node);
                return {
                    el: 'div',
                    name: node.name,
                    container: true,
                    smartStyle: {
                        default: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, yield getBackgroundStyles(node)), yield getBorderStyles(node)), getSizingStylesChild(node)), getPositionStyles(node)), getEffectStyles(node))
                    }
                };
            });
        }
        function getImgObj(node) {
            var _a;
            return __awaiter(this, void 0, void 0, function* () {
                const background = node.fills[0] || {};
                const imgBytes = yield ((_a = figma.getImageByHash(background.imageHash)) === null || _a === void 0 ? void 0 : _a.getBytesAsync());
                const src = imgBytes ? `data:image/png;base64,${figma.base64Encode(imgBytes)}` : '';
                return {
                    el: 'ImgEl',
                    name: node.name,
                    props: {
                        src,
                        alt: node.name
                    },
                    smartStyle: {
                        default: Object.assign(Object.assign(Object.assign(Object.assign({}, getSizingStylesChild(node)), yield getBorderStyles(node)), getPositionStyles(node)), getEffectStyles(node))
                    }
                };
            });
        }
        function getTextObj(node) {
            return __awaiter(this, void 0, void 0, function* () {
                const textStyles = yield getTextStyles(node);
                const boxStyles = Object.assign(Object.assign(Object.assign({}, yield getBorderStyles(node)), getSizingStylesText(node)), getPositionStyles(node));
                const nodes = textStyles.map((text) => ({
                    el: 'span',
                    name: text.characters,
                    template: text.characters,
                    smartStyle: {
                        default: Object.assign({}, text.styles)
                    }
                }));
                if (nodes.length === 1)
                    return Object.assign(Object.assign({}, nodes[0]), { smartStyle: {
                            default: Object.assign(Object.assign({}, nodes[0].smartStyle.default), boxStyles)
                        } });
                return {
                    el: 'div',
                    name: node.name,
                    container: true,
                    children: nodes.map((node) => {
                        const id = uid();
                        elements[id] = node;
                        return id;
                    }),
                    smartStyle: {
                        default: Object.assign(Object.assign(Object.assign({}, getSizingStylesText(node)), getPositionStyles(node)), yield getBorderStyles(node))
                    }
                };
            });
        }
        function getVectorObj(node) {
            return __awaiter(this, void 0, void 0, function* () {
                const svg = yield node.exportAsync({ format: 'SVG_STRING' });
                return {
                    el: 'ImgEl',
                    name: node.name,
                    smartStyle: {
                        default: Object.assign(Object.assign({}, getSizingStylesChild(node)), getPositionStyles(node))
                    },
                    props: {
                        src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
                        alt: node.name
                    }
                };
            });
        }
        function getGroupObj(node) {
            return __awaiter(this, void 0, void 0, function* () {
                return {
                    el: 'div',
                    name: node.name,
                    container: true,
                    smartStyle: {
                        default: Object.assign(Object.assign(Object.assign({ position: 'relative' }, getSizingStylesChild(node)), getPositionStyles(node)), getEffectStyles(node))
                    }
                };
            });
        }
        // Styles
        function getPositionStyles(node) {
            const isRelativeToFrame = node.parent.type === 'FRAME' && node.parent.layoutMode === 'NONE';
            const isAbsolute = node.parent.type === 'GROUP' || isRelativeToFrame;
            if (!isAbsolute)
                return {};
            const { x: childX, y: childY } = node;
            const { x: parentX, y: parentY } = isRelativeToFrame ? { x: 0, y: 0 } : node.parent;
            const x = childX - parentX;
            const y = childY - parentY;
            return {
                position: 'absolute',
                left: `${Math.floor(x)}px`,
                top: `${Math.floor(y)}px`
            };
        }
        function getEffectStyles(node) {
            return {
                boxShadow: node.effects.map((effect) => {
                    if (effect.type !== 'DROP_SHADOW')
                        return '';
                    const { r, g, b, a } = effect.color;
                    const color = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
                    const { x, y } = effect.offset;
                    const { radius } = effect;
                    return `${x}px ${y}px ${radius}px ${color}`;
                }).join(', ') || null
            };
        }
        function getSizingStylesParent(node) {
            const nodeDirection = node.layoutMode;
            const parentDirection = node.parent.layoutMode;
            let dimensions = { width: null, height: null };
            let alignSelf, flexGrow;
            const primaryStretch = parentDirection === nodeDirection ? node.layoutGrow === 1 : node.layoutAlign === 'STRETCH';
            const counterStretch = parentDirection !== nodeDirection ? node.layoutGrow === 1 : node.layoutAlign === 'STRETCH';
            const primaryProp = nodeDirection === 'HORIZONTAL' ? 'width' : 'height';
            const counterProp = nodeDirection === 'HORIZONTAL' ? 'height' : 'width';
            // Primary axis
            if (primaryStretch) {
                if (parentDirection === nodeDirection)
                    flexGrow = 1;
                else
                    alignSelf = 'stretch';
            }
            else if (node.primaryAxisSizingMode === 'FIXED') {
                dimensions[primaryProp] = `${node[primaryProp]}px`;
            }
            // Counter axis
            if (counterStretch) {
                if (parentDirection !== nodeDirection)
                    flexGrow = 1;
                else
                    alignSelf = 'stretch';
            }
            else if (node.counterAxisSizingMode === 'FIXED') {
                dimensions[counterProp] = `${node[counterProp]}px`;
            }
            if (node.parent.type === 'PAGE') {
                dimensions.width = '100%';
                dimensions.height = '100%';
            }
            const { width, height } = dimensions;
            return {
                flexGrow,
                alignSelf,
                width,
                height,
                boxSizing: node.strokesIncludedInLayout ? 'border-box' : null
            };
        }
        function getSizingStylesChild(node) {
            const parentDirection = node.parent.layoutMode;
            let dimensions = { width: null, height: null };
            let alignSelf, flexGrow;
            const primaryProp = parentDirection === 'HORIZONTAL' ? 'width' : 'height';
            const counterProp = parentDirection === 'HORIZONTAL' ? 'height' : 'width';
            // Flex Grow
            if (node.layoutGrow === 1) {
                flexGrow = 1;
            }
            else {
                dimensions[primaryProp] = `${Math.floor(node[primaryProp])}px`;
            }
            // Align Self
            if (node.layoutAlign === 'STRETCH') {
                alignSelf = 'stretch';
            }
            else {
                dimensions[counterProp] = `${Math.floor(node[counterProp])}px`;
            }
            const { width, height } = dimensions;
            return {
                flexGrow,
                alignSelf,
                width,
                height,
                boxSizing: node.strokesIncludedInLayout ? 'border-box' : null
            };
        }
        function getSizingStylesText(node) {
            const parentDirection = node.parent.layoutMode;
            let dimensions = { width: null, height: null };
            let alignSelf, flexGrow;
            const textAutoResize = node.textAutoResize;
            const primaryProp = parentDirection === 'HORIZONTAL' ? 'width' : 'height';
            const counterProp = parentDirection === 'HORIZONTAL' ? 'height' : 'width';
            // Primary axis
            if (textAutoResize.includes(primaryProp.toUpperCase())) { // Autoresize
                dimensions[primaryProp] = null;
            }
            else if (node.layoutGrow === 1) { // Stretch
                flexGrow = 1;
            }
            else { // Fixed
                dimensions[primaryProp] = `${Math.floor(node[primaryProp])}px`;
            }
            // Secondary axis
            if (textAutoResize.includes(counterProp.toUpperCase())) { // Autoresize
                dimensions[counterProp] = null;
            }
            else if (node.layoutAlign === 'STRETCH') { // Stretch
                alignSelf = 'stretch';
            }
            else { // Fixed
                dimensions[counterProp] = `${Math.floor(node[counterProp])}px`;
            }
            const { width, height } = dimensions;
            return {
                flexGrow,
                alignSelf,
                width,
                height,
                boxSizing: node.strokesIncludedInLayout ? 'border-box' : null
            };
        }
        function getContainerStyles(node) {
            const alignMap = {
                MIN: 'flex-start',
                CENTER: 'center',
                MAX: 'flex-end',
                STRETCH: null,
                BASELINE: 'baseline'
            };
            const justifyMap = {
                MIN: null,
                CENTER: 'center',
                MAX: 'flex-end',
                SPACE_BETWEEN: 'space-between'
            };
            return {
                display: 'flex',
                flexDirection: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
                justifyContent: justifyMap[node.primaryAxisAlignItems],
                alignItems: alignMap[node.counterAxisAlignItems],
                gap: node.itemSpacing && node.primaryAxisAlignItems !== 'SPACE_BETWEEN' ? `${node.itemSpacing}px` : null,
                padding: shorthand(node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft),
            };
        }
        function getBackgroundStyles(node) {
            return __awaiter(this, void 0, void 0, function* () {
                const backgroundScaleDict = {
                    'FILL': 'cover',
                    'FIT': 'contain'
                };
                const background = node.fills[0];
                const backgroundType = background && background.type === 'SOLID' ? 'backgroundColor' : 'backgroundImage';
                const backgroundSize = background && backgroundScaleDict[background.scaleMode] || null;
                return {
                    [backgroundType]: node.fills[0] ? yield getFill(node.fills[0]) : null,
                    backgroundSize,
                };
            });
        }
        function getBorderStyles(node) {
            return __awaiter(this, void 0, void 0, function* () {
                const strokeWeight = typeof node.strokeWeight === 'string' ? `${node.strokeWeight}px` : `${node.strokeTopWeight}px ${node.strokeRightWeight}px ${node.strokeBottomWeight}px ${node.strokeLeftWeight}px`;
                const cornerRadius = typeof node.cornerRadius === 'string' ? `${node.cornerRadius}px` : `${node.topLeftRadius}px ${node.topRightRadius}px ${node.bottomRightRadius}px ${node.bottomLeftRadius}px`;
                return {
                    borderWidth: node.strokes[0] ? strokeWeight : null,
                    borderColor: node.strokes[0] ? yield getFill(node.strokes[0]) : null,
                    borderRadius: node.cornerRadius ? cornerRadius : null
                };
            });
        }
        function getTextStyles(node) {
            return __awaiter(this, void 0, void 0, function* () {
                const segments = node.getStyledTextSegments(['fontName', 'fontSize', 'fills', 'fontWeight', 'textDecoration', 'textCase', 'lineHeight']);
                const styles = yield Promise.all(segments.map((segment) => __awaiter(this, void 0, void 0, function* () {
                    const decorationMap = {
                        'STRIKETHROUGH': 'line-through',
                        'UNDERLINE': 'underline'
                    };
                    const caseMap = {
                        'ORIGINAL': null,
                        'UPPER': 'uppercase',
                        'LOWER': 'lowercase',
                        'TITLE': 'capitalize'
                    };
                    const alignMap = {
                        'LEFT': null,
                        'RIGHT': 'right',
                        'CENTER': 'center',
                        'JUSTIFIED': 'justify'
                    };
                    const lineHeight = getValueWithUnits(segment.lineHeight);
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
                            color: segment.fills[0] ? yield getFill(segment.fills[0]) : ''
                        }
                    };
                })));
                return styles;
            });
        }
        // Helpers
        function getValueWithUnits({ value = 0, unit = 'PIXELS' }) {
            const unitMap = {
                'PIXELS': 'px',
                'PERCENT': '%',
                'AUTO': 'auto'
            };
            if (unit === 'AUTO')
                return 'auto';
            if (!value)
                return null;
            return `${value}${unitMap[unit]}`;
        }
        function shorthand(top, right, bottom, left) {
            if (top === right && right === bottom && bottom === left)
                return top ? `${top}px` : null;
            if (top === bottom && right === left)
                return `${top}px ${right}px`;
            return `${top}px ${right}px ${bottom}px ${left}px`;
        }
        function getFill(fill) {
            var _a;
            return __awaiter(this, void 0, void 0, function* () {
                if (fill.type === 'SOLID')
                    return `rgba(${Math.floor(fill.color.r * 255)}, ${Math.floor(fill.color.g * 255)}, ${Math.floor(fill.color.b * 255)}, ${Math.round(fill.opacity * 100) / 100})`;
                else if (fill.type === 'GRADIENT_LINEAR')
                    return `linear-gradient(${Math.ceil(getAngle(fill.gradientTransform) + 90)}deg, ${fill.gradientStops.map((stop) => `rgba(${Math.floor(stop.color.r * 255)}, ${Math.floor(stop.color.g * 255)}, ${Math.floor(stop.color.b * 255)}, ${Math.round(stop.color.a * 100) / 100}) ${Math.round(stop.position * 100)}%`).join(', ')})`;
                else if (fill.type === 'IMAGE') {
                    const imgBytes = yield ((_a = figma.getImageByHash(fill.imageHash)) === null || _a === void 0 ? void 0 : _a.getBytesAsync());
                    if (!imgBytes)
                        return '';
                    return `url(data:image/png;base64,${figma.base64Encode(imgBytes)})`;
                }
                else
                    return '';
            });
        }
        function mapChildren(children = []) {
            return Promise.all(children
                .filter((child) => fns[child.type])
                .map((child) => mapChild(child)));
        }
    });
}
// Helpers
function uid(length = 12) {
    let result = '';
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++)
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    return result;
}
function getAngle(transform) {
    const decomposed = decomposeRelativeTransform(transform[0], transform[1]);
    return (decomposed.rotation * 180) / Math.PI;
}
function decomposeRelativeTransform(t1, t2) {
    const a = t1[0];
    const b = t1[1];
    const c = t1[2];
    const d = t2[0];
    const e = t2[1];
    const f = t2[2];
    const delta = a * d - b * c;
    const result = {
        translation: [e, f],
        rotation: 0,
        scale: [0, 0],
        skew: [0, 0],
    };
    if (a !== 0 || b !== 0) {
        const r = Math.sqrt(a * a + b * b);
        result.rotation = b > 0 ? Math.acos(a / r) : -Math.acos(a / r);
        result.scale = [r, delta / r];
        result.skew = [Math.atan((a * c + b * d) / (r * r)), 0];
    }
    return result;
}
