var trumpet = require('trumpet');
var glob = require('glob');
var through = require('through2');
var CombinedStream = require('combined-stream2');
var fs = require('fs');
var path = require('path');

module.exports = function (opts) {
    if (!opts) opts = {};
    var basedir = opts.basedir || process.cwd();
    var tr = trumpet();

    if (!(opts.ignoreScripts || opts['ignore-scripts'])) {
        tr.selectAll('script[src]', function (node) {
            var src = node.getAttribute('src');

            if(opts['template-wildcards']
               && node.getAttribute('type') == 'text/template' 
               && src.match(/\*/)) {

                var wstream = node.createWriteStream({outer: true});
                src = fix(node.getAttribute('src'));
                var cstream = CombinedStream.create();
                var id, i;
                glob(src, function(err, files) {
                    if(err) return;
                    for(i=0; i < files.length; i++) {
                        id = path.basename(files[i]).replace(/\..+?$/, '-template');
                        cstream.append(Buffer('<script type="text/template" id="'+id+'">\n'));
                        cstream.append(fs.createReadStream(files[i]));
                        cstream.append(Buffer('</script>\n'));
                    }

                    if(files.length > 0) {
                        cstream.pipe(wstream);
                    } else {
                        wstream.end('');
                    }
                });
                
            } else {
                src = fix(src);
                node.removeAttribute('src');
                fs.createReadStream(src)
                    .pipe(node.createWriteStream());
            }
        });
    }

    if (!(opts.ignoreImages || opts['ignore-images'])) {
        tr.selectAll('img[src]', function (node) {
            var file = fix(node.getAttribute('src'));
            var w = node.createWriteStream({ outer: true });
            var attrs = node.getAttributes();
            w.write('<img');
            Object.keys(attrs).forEach(function (key) {
                if (key === 'src') return;
                w.write(' ' + key + '="' + enc(attrs[key]) + '"');
            });
            var ext = path.extname(file).replace(/^\./, '');;
            w.write(' src="data:image/' + ext + ';base64,');
            fs.createReadStream(file).pipe(through(write, end));
            
            var bytes = 0, last = null;
            
            function write (buf, enc, next) {
                if (last) {
                    buf = Buffer.concat([ last, buf ]);
                    last = null;
                }
                
                var b;
                if (buf.length % 3 === 0) {
                    b = buf;
                }
                else {
                    b = buf.slice(0, buf.length - buf.length % 3);
                    last = buf.slice(buf.length - buf.length % 3);
                }
                w.write(b.toString('base64'));
                
                next();
            }
            function end () {
                if (last) w.write(last.toString('base64'));
                w.end('">');
            }
        });
    }

    if (!(opts.ignoreStyles || opts['ignore-styles'])) {
        tr.selectAll('link[href]', function (node) {
            var rel = node.getAttribute('rel').toLowerCase();
            if (rel !== 'stylesheet') return;
            var file = fix(node.getAttribute('href'));

            var w = node.createWriteStream({ outer: true });
            w.write('<style>');
            var r = fs.createReadStream(file);
            r.pipe(w, { end: false });
            r.on('end', function () { w.end('</style>') });
        });
    }

    return tr;

    function fix (p) {
        if(path.isAbsolute(p)) {
            return path.resolve(basedir, path.relative('/', p));
        } else {
            return path.resolve(basedir, p);
        }
    }
    function enc (s) {
        return s.replace(/"/g, '&#34;')
            .replace(/>/g, '&gt;')
            .replace(/</g, '&lt;')
        ;
    }
};
