
import cv2
import numpy as np
import base64
img = np.ones((100, 600, 3), dtype=np.uint8) * 255
cv2.putText(img, 'Part 1. Grammar ____ test.', (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
# Draw an actual line to simulate underline
cv2.line(img, (260, 55), (340, 55), (0, 0, 0), 2)
_, buffer = cv2.imencode('.png', img)
print(base64.b64encode(buffer).decode('utf-8'))
