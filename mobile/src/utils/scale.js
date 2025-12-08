import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const guidelineBaseWidth = 375; // iPhone X širina kao referenca
const scale = width / guidelineBaseWidth;

export const ms = (size, factor = 0.25) => size + (scale - 1) * size * factor;
export const s = (size) => size * scale;

// Responsive font: skalar s gornjom i donjom granicom
export const rf = (size, min = size * 0.9, max = size * 1.2) => {
	const scaled = size * scale;
	return Math.min(max, Math.max(min, scaled));
};

export default ms;
