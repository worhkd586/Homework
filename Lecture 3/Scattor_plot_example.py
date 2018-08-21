##Scatter points의 경향을 보면 상관관계를 알 수 있음
import numpy as np

import plotly.offline as pyo
import plotly.graph_objs as go

np.random.seed(42)
random_x = np.random.randint(1, 101, 100)
random_y = np.random.randint(1, 101, 100)

data = [go.Scatter(x=random_x,          ##Scatter Plot 호출
                    y=random_y,
                    mode='markers',
                    marker=dict(
                        size=10,
                        color='rgb(51, 204, 153)',
                        symbol='pentagon',
                        line = {'width':2}
                    ))]
layout = go.Layout(title='Hello First Plot',            ##Layout을 설정한다
                    xaxis={'title' : 'MY X AXIS'},      ##such as title, xaxis, yaxis, hovermode
                    yaxis=dict(title='MY Y AXIS'),      ##dict() 함수 호출, title, color등 설정 가능
                    hovermode='closest')                ##hovermode설정 각 Point의 정보를 보여

fig = go.Figure(data=data, layout=layout)       ##Define Figure Object
pyo.plot(fig, filename='scatter.html')          ##html에서 열게해줌
