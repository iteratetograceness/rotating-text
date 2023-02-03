var React = require('react');
var framerMotion = require('framer-motion');

var styles = {"container":"_p6aGD","front":"_2ilYQ","back":"_uQNyq","placeholder":"_3HCUh"};

var RotatingText = function RotatingText(_ref) {
  var text = _ref.text,
    _ref$timing = _ref.timing,
    timing = _ref$timing === void 0 ? 0.5 : _ref$timing,
    _ref$stagger = _ref.stagger,
    stagger = _ref$stagger === void 0 ? 0.1 : _ref$stagger,
    className = _ref.className,
    style = _ref.style;
  var prefersReducedMotion = framerMotion.useReducedMotion();
  var animate = framerMotion.useAnimationControls();
  var hoverArea = {
    rotate: {
      z: 0
    }
  };
  var container = {
    rotate: {
      transition: {
        staggerChildren: stagger
      }
    }
  };
  var duration = React.useMemo(function () {
    if (Array.isArray(timing)) return timing;else return Array.from({
      length: text.length
    }, function () {
      return timing;
    });
  }, [timing]);
  var wordCopy = prefersReducedMotion ? undefined : {
    rotate: function rotate(i) {
      return {
        y: ['0%', '30%'],
        rotateX: [0, 90],
        scaleX: [1, 0.4],
        scaleY: [1, 0.4],
        transition: {
          duration: duration[i]
        }
      };
    }
  };
  var word = prefersReducedMotion ? undefined : {
    rotate: function rotate(i) {
      return {
        y: ['-30%', '0%'],
        rotateX: [-90, 0],
        scaleX: [0.4, 1],
        scaleY: [0.4, 1],
        transition: {
          duration: duration[i]
        }
      };
    }
  };
  return React.createElement(framerMotion.motion.div, {
    className: styles.container + " " + className,
    variants: hoverArea,
    animate: animate,
    initial: 'initial',
    whileHover: prefersReducedMotion ? {
      scale: 1.05
    } : undefined,
    onHoverStart: function onHoverStart() {
      return animate.start('rotate');
    },
    style: style
  }, React.createElement(framerMotion.motion.div, {
    className: styles.front,
    variants: container
  }, Array.from(text).map(function (_char, i) {
    return React.createElement(framerMotion.motion.span, {
      custom: i,
      key: "" + _char + i,
      variants: wordCopy
    }, _char);
  })), React.createElement(framerMotion.motion.div, {
    className: styles.back,
    variants: container
  }, Array.from(text).map(function (_char2, i) {
    return React.createElement(framerMotion.motion.span, {
      custom: i,
      key: "" + _char2 + i + "copy",
      variants: word
    }, _char2);
  })), React.createElement("div", {
    className: styles.placeholder
  }, text));
};

exports.RotatingText = RotatingText;
//# sourceMappingURL=index.js.map
