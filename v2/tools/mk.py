# The Centrul360 mark, exact geometry of brand_asset/logo-mark-source.svg: a ring (r 262) and two ellipses
# (104 x 207 upright, 207 x 113 lying), the same stroke on all three (21 of 810 in the original).
def mark(stroke=21, color='#0b0b0d', bg=None, radius=0, pad=0, size=810, dark=False):
    vb0, vbs = 143 - stroke/2 - pad, 524 + stroke + 2*pad
    rect = ''
    if bg:
        rect = '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s"/>' % (vb0, vb0, vbs, vbs, radius*vbs, bg)
    style = ''
    if dark:
        style = '<style>g{stroke:%s}@media (prefers-color-scheme:dark){g{stroke:#ffffff}}</style>' % color
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%g %g %g %g" width="%d" height="%d">%s%s'
            '<g fill="none" stroke="%s" stroke-width="%g">'
            '<circle cx="405" cy="405" r="262"/><ellipse cx="405" cy="405" rx="104" ry="207"/><ellipse cx="405" cy="405" rx="207" ry="113"/></g></svg>'
            % (vb0, vb0, vbs, vbs, size, size, style, rect, color, stroke))
