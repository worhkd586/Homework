##Bar Chart는 Categorical Data를 표현할때 사용한다.
## x축은 카테고리를 y축은 count(Number of occurrences in each Category)를 설정
## 그러나 y축은 any aggreation도 될 수 있다.

import plotly.offline as pyo
import plotly.graph_objs as go
import pandas as pd

df = pd.read_csv('2018WinterOlympics.csv')

trace1 = go.Bar(x=df['NOC'], y=df['Gold'],
                name='Gold', marker={'color' : '#FFD700'}) ##marker 차트 color 등등 설정

trace2 = go.Bar(x=df['NOC'], y=df['Silver'],
                name='Gold', marker={'color' : '#9EA0A1'})

trace3 = go.Bar(x=df['NOC'], y=df['Bronze'],
                name='Gold', marker={'color' : '#CD7F32'})


data = [trace1, trace2, trace3]
layout = go.Layout(title='Medals', barmode='stack')  ##barmode Bar차트 모형 설정
fig = go.Figure(data=data, layout=layout)
pyo.plot(fig)
