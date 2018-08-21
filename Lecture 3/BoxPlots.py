##Box Plots은 변수의 연속적인 데이터를 quartiles의 형태로 시각화한다.
## 카테고리 특징으로 변수를 나누어 각 변수의 특성을 확인할 수 있다.

import pandas as pd
import plotly.offline as pyo
import plotly.graph_objs as go

snodgrass = [.209,.205,.196,.210,.202,.207,.224,.223,.220,.201]
twain = [.225,.262,.217,.240,.230,.229,.235,.217]
data = [go.Box(y=snodgrass, name='Snodgrass'),
        go.Box(y=twain, name='Twain')]

pyo.plot(data)
